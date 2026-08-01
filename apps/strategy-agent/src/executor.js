import { randomUUID } from 'node:crypto'
import { TaskState } from '@a2a-js/sdk'
import {
  extractText,
  firstDataPart,
  noopLogger,
  parseWireMessage,
  publishArtifact,
  publishStatus,
  publishTaskSubmitted,
  requestMalformed,
  requestMalformedFromZod,
} from '@wealth/a2a-common'
import { PhilosophyId, StrategyRequest } from '@wealth/schemas'
import { deriveAllocation } from './allocator.js'

// Resolves the inbound message to a validated strategy-request-v1. A data
// part is the typed path; a text part must be an EXACT philosophy id — the
// D4 free-text→enum extraction belongs to the Orchestrator (LLM or scripted
// keyword matcher), never to this deterministic server.
export function resolveStrategyRequest(message) {
  const data = firstDataPart(message)
  if (data !== undefined) {
    const result = StrategyRequest.safeParse(data)
    if (!result.success) {
      throw requestMalformedFromZod(result.error.issues, {
        pathPrefix: 'strategy-request-v1',
      })
    }
    return result.data
  }

  const rawText = extractText(message)
  const parsed = PhilosophyId.safeParse(rawText.trim().toLowerCase())
  if (!parsed.success) {
    throw requestMalformed(
      'philosophy',
      `unrecognized philosophy "${rawText}" — expected one of: ${PhilosophyId.options.join(', ')}`,
    )
  }
  if (parsed.data === 'custom') {
    throw requestMalformed(
      'customWeights',
      'custom philosophy requires a strategy-request-v1 data part with customWeights',
    )
  }
  return { philosophy: parsed.data }
}

// Boundary middleware: malformed philosophy/weights → -32602 before any task
// exists. deriveAllocation runs here too so bad custom weights reject on the
// wire (it is a pure lookup — running it twice costs nothing).
export function createStrategyRequestValidator() {
  return ({ message }) => {
    if (message?.taskId) return
    deriveAllocation(resolveStrategyRequest(parseWireMessage(message)))
  }
}

export function createStrategyExecutor({
  clock = () => new Date(),
  idFactory = randomUUID,
  logger = noopLogger,
} = {}) {
  return {
    async execute(ctx, eventBus) {
      const request = resolveStrategyRequest(ctx.userMessage)
      const allocation = deriveAllocation(request) // Allocation.parse'd inside

      publishTaskSubmitted(eventBus, ctx, { clock })
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_WORKING,
        'interpreting philosophy',
        {
          clock,
          idFactory,
        },
      )
      publishStatus(
        eventBus,
        ctx,
        TaskState.TASK_STATE_WORKING,
        'computing target weights',
        {
          clock,
          idFactory,
        },
      )
      publishArtifact(eventBus, ctx, {
        artifactId: 'target-allocation',
        name: 'target-allocation',
        data: allocation,
        schemaName: 'allocation-v1',
      })
      publishStatus(eventBus, ctx, TaskState.TASK_STATE_COMPLETED, undefined, {
        clock,
        idFactory,
      })
      eventBus.finished()
      logger.info('allocation derived', {
        taskId: ctx.taskId,
        contextId: ctx.contextId,
        philosophy: allocation.philosophy,
      })
    },
    // The stream is short-lived and never pauses; nothing to cancel.
    async cancelTask() {},
  }
}
