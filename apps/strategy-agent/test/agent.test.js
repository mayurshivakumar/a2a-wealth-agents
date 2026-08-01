import { TaskState } from '@a2a-js/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import {
  artifactData,
  createA2AServer,
  createRemoteClientFactory,
  createUserMessage,
} from '@wealth/a2a-common'
import { Allocation, expectedBogleheadsAllocation } from '@wealth/schemas'
import { strategyCardFor } from '../src/card.js'
import {
  createStrategyExecutor,
  createStrategyRequestValidator,
} from '../src/executor.js'

const applications = []

async function startAgent() {
  const application = createA2AServer({
    host: 'localhost',
    port: 0,
    cardFor: strategyCardFor,
    executor: createStrategyExecutor(),
    validateRequest: createStrategyRequestValidator(),
  })
  const baseUrl = await application.start()
  applications.push(application)
  const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
  return { client: await factory.createFromUrl(baseUrl) }
}

function request(message, returnImmediately = false) {
  return {
    tenant: '',
    configuration: {
      acceptedOutputModes: ['application/json'],
      returnImmediately,
    },
    message,
  }
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('Strategy agent over SSE', () => {
  it('streams task → working ×2 → artifact → completed in order', async () => {
    const { client } = await startAgent()
    const events = []
    for await (const streamResponse of client.sendMessageStream(
      request(
        createUserMessage({
          data: { philosophy: 'bogleheads-three-fund' },
          schemaName: 'strategy-request-v1',
        }),
      ),
    )) {
      events.push(streamResponse)
    }

    const kinds = events.map((event) => event.payload.$case)
    expect(kinds).toEqual([
      'task',
      'statusUpdate',
      'statusUpdate',
      'artifactUpdate',
      'statusUpdate',
    ])

    const [task, working1, working2, artifactUpdate, completed] = events.map(
      (event) => event.payload.value,
    )
    expect(task.status.state).toBe(TaskState.TASK_STATE_SUBMITTED)
    expect(working1.status.state).toBe(TaskState.TASK_STATE_WORKING)
    expect(working2.status.state).toBe(TaskState.TASK_STATE_WORKING)
    expect(artifactUpdate.lastChunk).toBe(true)
    expect(completed.status.state).toBe(TaskState.TASK_STATE_COMPLETED)

    const allocation = Allocation.parse(artifactData(artifactUpdate.artifact))
    expect(allocation).toEqual(expectedBogleheadsAllocation)
  })

  it('accepts an exact philosophy id as a text part', async () => {
    const { client } = await startAgent()
    const result = await client.sendMessage(
      request(createUserMessage({ text: 'all-weather' })),
    )
    expect(result.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    const allocation = Allocation.parse(artifactData(result.artifacts[0]))
    expect(allocation.philosophy).toBe('all-weather')
    expect(allocation.targets).toHaveLength(5)
  })

  it('rejects an unknown philosophy with -32602 (unary)', async () => {
    const { client } = await startAgent()
    let rejection
    try {
      await client.sendMessage(
        request(createUserMessage({ text: 'yolo-max-growth' })),
      )
    } catch (error) {
      rejection = error
    }
    expect(rejection.envelopeCode).toBe(-32602)
    expect(rejection.message).toMatch(/unrecognized philosophy/)
  })

  it('rejects invalid custom weights with -32602 before any stream starts', async () => {
    const { client } = await startAgent()
    let rejection
    try {
      await client.sendMessage(
        request(
          createUserMessage({
            data: {
              philosophy: 'custom',
              customWeights: { 'us-total-market': 60 },
            },
            schemaName: 'strategy-request-v1',
          }),
        ),
      )
    } catch (error) {
      rejection = error
    }
    expect(rejection.envelopeCode).toBe(-32602)
    expect(rejection.message).toMatch(/must sum to 100/)
  })
})
