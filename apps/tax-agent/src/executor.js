import { randomUUID } from 'node:crypto'
import { TaskState } from '@a2a-js/sdk'
import {
  TaskCanceledInterrupt,
  firstDataPart,
  noopLogger,
  parseWireMessage,
  publishArtifact,
  publishFollowUpTurn,
  publishStatus,
  publishTaskSubmitted,
  requestMalformed,
  requestMalformedFromZod,
  sleepUnlessCanceled,
} from '@wealth/a2a-common'
import { ExecutionPlan, TaxFollowup, TaxRequest } from '@wealth/schemas'
import { harvest } from './harvester.js'

export function resolveTaxRequest(message) {
  const data = firstDataPart(message)
  if (data === undefined) {
    throw requestMalformed(
      'tax-request-v1',
      'expected a tax-request-v1 data part (portfolio + allocation)',
    )
  }
  const result = TaxRequest.safeParse(data)
  if (!result.success) {
    throw requestMalformedFromZod(result.error.issues, {
      pathPrefix: 'tax-request-v1',
    })
  }
  return result.data
}

export function resolveTaxFollowup(message) {
  const data = firstDataPart(message)
  if (data === undefined) {
    throw requestMalformed(
      'tax-followup-v1',
      'expected a tax-followup-v1 data part ({ lotId, purchaseDate })',
    )
  }
  const result = TaxFollowup.safeParse(data)
  if (!result.success) {
    throw requestMalformedFromZod(result.error.issues, {
      pathPrefix: 'tax-followup-v1',
    })
  }
  return result.data
}

// Boundary middleware: initial sends carry tax-request-v1, follow-up sends
// (taskId set) carry tax-followup-v1. Schema-invalid → -32602 on the wire;
// semantically wrong-but-well-formed follow-ups (unknown lotId) are handled
// by the executor by re-asking, not failing.
export function createTaxRequestValidator() {
  return ({ message }) => {
    const parsed = parseWireMessage(message)
    if (message?.taskId) {
      resolveTaxFollowup(parsed)
    } else {
      resolveTaxRequest(parsed)
    }
  }
}

/**
 * Long-running async executor (Flow C):
 *   submitted → working("selecting lots") → [input-required …] →
 *   working("resuming with purchase date") → working("checking wash-sale
 *   windows") → completed | failed; canceled via CancelTask at any sleep.
 *
 * Per-task state (AbortController + the mutable request awaiting input) lives
 * in maps keyed by taskId and is deleted on every terminal path — verified by
 * tests via taskCount(). Everything here is in-memory by design.
 */
export function createTaxExecutor({
  rates,
  prices,
  clock = () => new Date(),
  idFactory = randomUUID,
  simulatedDelayMs = 1_500,
  logger = noopLogger,
} = {}) {
  const active = new Map() // taskId → { controller, contextId }
  const pending = new Map() // taskId → { request, awaitingLotId }

  const publishOptions = { clock, idFactory }

  function cleanup(taskId) {
    active.delete(taskId)
    pending.delete(taskId)
  }

  async function runPipeline(
    ctx,
    eventBus,
    request,
    signal,
    { resuming = false } = {},
  ) {
    const taskId = ctx.taskId ?? ctx.task?.id
    if (resuming) {
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_WORKING,
        'resuming with purchase date',
        publishOptions,
      )
    } else {
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_WORKING,
        'selecting lots',
        publishOptions,
      )
    }
    await sleepUnlessCanceled(simulatedDelayMs, signal)

    const outcome = harvest({
      portfolio: request.portfolio,
      allocation: request.allocation,
      rates,
      prices,
    })

    if (outcome.kind === 'input-required') {
      pending.set(taskId, { request, awaitingLotId: outcome.lotId })
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_INPUT_REQUIRED,
        outcome.question,
        publishOptions,
      )
      eventBus.finished()
      logger.info('tax task paused for input', { taskId, lotId: outcome.lotId })
      return
    }

    publishStatus(
      eventBus,
      ctx,
      TaskState.TASK_STATE_WORKING,
      'checking wash-sale windows',
      publishOptions,
    )
    await sleepUnlessCanceled(simulatedDelayMs, signal)

    if (outcome.kind === 'failed') {
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_FAILED,
        outcome.reason,
        publishOptions,
      )
      eventBus.finished()
      cleanup(taskId)
      logger.warn('tax task failed', { taskId, reason: outcome.reason })
      return
    }

    const plan = ExecutionPlan.parse(outcome.plan) // outbound validation before publish
    publishArtifact(eventBus, ctx, {
      artifactId: 'execution-plan',
      name: 'execution-plan',
      data: plan,
      schemaName: 'execution-plan-v1',
    })
    publishStatus(
      eventBus,
      ctx,
      TaskState.TASK_STATE_COMPLETED,
      undefined,
      publishOptions,
    )
    eventBus.finished()
    cleanup(taskId)
    logger.info('tax task completed', {
      taskId,
      actions: plan.actions.length,
      estimatedTaxSavings: plan.estimatedTaxSavings,
    })
  }

  return {
    async execute(ctx, eventBus) {
      const taskId = ctx.taskId ?? ctx.task?.id

      try {
        if (ctx.task) {
          // Follow-up turn on the same taskId (input-required continuation).
          publishFollowUpTurn(eventBus, ctx, { clock })
          const state = pending.get(taskId)
          if (!state) {
            publishStatus(
              eventBus,
              ctx,
              TaskState.TASK_STATE_FAILED,
              'no pending input for this task (state is in-memory and resets on restart)',
              publishOptions,
            )
            eventBus.finished()
            cleanup(taskId)
            return
          }

          const followup = resolveTaxFollowup(ctx.userMessage)
          const lot = state.request.portfolio.holdings
            .flatMap((holding) => holding.lots)
            .find((candidate) => candidate.lotId === followup.lotId)
          if (!lot || followup.lotId !== state.awaitingLotId) {
            publishStatus(
              eventBus,
              ctx,
              TaskState.TASK_STATE_INPUT_REQUIRED,
              `Unknown or unexpected lot "${followup.lotId}" — still waiting on the purchase date for lot ${state.awaitingLotId}.`,
              publishOptions,
            )
            eventBus.finished()
            logger.info('tax follow-up re-asked', {
              taskId,
              got: followup.lotId,
            })
            return
          }

          lot.purchaseDate = followup.purchaseDate
          pending.delete(taskId)
          const signal = active.get(taskId)?.controller.signal
          await runPipeline(ctx, eventBus, state.request, signal, {
            resuming: true,
          })
          return
        }

        // Initial turn.
        const request = resolveTaxRequest(ctx.userMessage)
        const controller = new AbortController()
        active.set(taskId, { controller, contextId: ctx.contextId })
        publishTaskSubmitted(eventBus, ctx, { clock })
        await runPipeline(ctx, eventBus, request, controller.signal)
      } catch (error) {
        if (error instanceof TaskCanceledInterrupt) {
          // cancelTask already published the CANCELED status; just stop.
          eventBus.finished()
          cleanup(taskId)
          logger.info('tax task canceled mid-run', { taskId })
          return
        }
        cleanup(taskId)
        throw error // SDK synthesizes a FAILED task/status from executor errors
      }
    },

    async cancelTask(taskId, eventBus) {
      const entry = active.get(taskId)
      publishStatus(
        eventBus,
        { taskId, contextId: entry?.contextId ?? '' },
        TaskState.TASK_STATE_CANCELED,
        'canceled by request',
        publishOptions,
      )
      entry?.controller.abort()
      // Unconditional: covers tasks paused at input-required (no live execute
      // loop to run the interrupt path); cleanup is idempotent when the
      // aborted execute() also runs it.
      cleanup(taskId)
      logger.info('tax task cancel requested', { taskId })
    },

    /** Test/ops hook: number of tasks with live per-task state. */
    taskCount() {
      return new Set([...active.keys(), ...pending.keys()]).size
    },
  }
}
