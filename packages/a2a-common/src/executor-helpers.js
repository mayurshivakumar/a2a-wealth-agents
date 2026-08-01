import { randomUUID } from 'node:crypto'
import { TaskState } from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { createAgentMessage, createDataPart } from './messages.js'

// The SDK enforces that the FIRST event published by every execute() call —
// including follow-up input-required turns — is a `task` or `message` event.
// These helpers are the only way agents should open a turn, so the rule can't
// be forgotten.

export function publishTaskSubmitted(
  eventBus,
  ctx,
  { clock = () => new Date() } = {},
) {
  eventBus.publish(
    AgentEvent.task({
      id: ctx.taskId,
      contextId: ctx.contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        message: undefined,
        timestamp: clock().toISOString(),
      },
      artifacts: [],
      history: ctx.userMessage ? [ctx.userMessage] : [],
      metadata: {},
    }),
  )
}

export function publishFollowUpTurn(
  eventBus,
  ctx,
  { clock = () => new Date() } = {},
) {
  if (!ctx.task) {
    throw new Error(
      'publishFollowUpTurn requires an existing task on the RequestContext',
    )
  }
  // Re-publish the snapshot with a WORKING status: the event queue treats an
  // INPUT_REQUIRED status as a stop signal, so replaying the paused task
  // verbatim would end the follow-up turn before any new event is seen.
  eventBus.publish(
    AgentEvent.task({
      ...ctx.task,
      status: {
        state: TaskState.TASK_STATE_WORKING,
        message: undefined,
        timestamp: clock().toISOString(),
      },
    }),
  )
}

export function publishStatus(
  eventBus,
  ctx,
  state,
  text,
  { clock = () => new Date(), idFactory = randomUUID } = {},
) {
  const taskId = ctx.taskId ?? ctx.task?.id
  eventBus.publish(
    AgentEvent.statusUpdate({
      taskId,
      contextId: ctx.contextId,
      status: {
        state,
        message: text
          ? createAgentMessage({
              text,
              contextId: ctx.contextId,
              taskId,
              idFactory,
            })
          : undefined,
        timestamp: clock().toISOString(),
      },
      metadata: {},
    }),
  )
}

export function publishArtifact(
  eventBus,
  ctx,
  {
    artifactId,
    name,
    data,
    schemaName,
    description = '',
    lastChunk = true,
    metadata = {},
  },
) {
  eventBus.publish(
    AgentEvent.artifactUpdate({
      taskId: ctx.taskId ?? ctx.task?.id,
      contextId: ctx.contextId,
      artifact: {
        artifactId,
        name,
        description,
        parts: [createDataPart(data, { schemaName })],
        metadata: {
          ...(schemaName ? { schema: schemaName } : {}),
          ...metadata,
        },
        extensions: [],
      },
      append: false,
      lastChunk,
      metadata: {},
    }),
  )
}

export class TaskCanceledInterrupt extends Error {
  constructor() {
    super('task canceled')
    this.name = 'TaskCanceledInterrupt'
  }
}

/**
 * Sleeps for `ms`, rejecting with TaskCanceledInterrupt if the signal aborts
 * first. Long-running executors sleep in slices via this helper so CancelTask
 * interrupts them promptly; the canceled status itself is published by
 * cancelTask, so callers just stop on the interrupt.
 */
export function sleepUnlessCanceled(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TaskCanceledInterrupt())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new TaskCanceledInterrupt())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
