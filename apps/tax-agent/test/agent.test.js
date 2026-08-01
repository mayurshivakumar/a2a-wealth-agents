import { TaskState } from '@a2a-js/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import {
  artifactData,
  createA2AServer,
  createRemoteClientFactory,
  createUserMessage,
  extractText,
  findArtifact,
  isTerminal,
} from '@wealth/a2a-common'
import {
  ExecutionPlan,
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
} from '@wealth/schemas'
import { taxCardFor } from '../src/card.js'
import {
  createTaxExecutor,
  createTaxRequestValidator,
} from '../src/executor.js'

const applications = []

function happyPortfolio() {
  return {
    portfolioId: 'pf-test',
    asOf: '2026-07-29T00:00:00.000Z',
    holdings: structuredClone(expectedHappyHoldings),
    uninvestedCash: structuredClone(expectedHappyCash),
  }
}

async function startAgent({ simulatedDelayMs = 10 } = {}) {
  const executor = createTaxExecutor({ simulatedDelayMs })
  const application = createA2AServer({
    host: 'localhost',
    port: 0,
    cardFor: taxCardFor,
    executor,
    validateRequest: createTaxRequestValidator(),
  })
  const baseUrl = await application.start()
  applications.push(application)
  const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
  return { client: await factory.createFromUrl(baseUrl), executor }
}

function taxRequest(portfolio, allocation = expectedBogleheadsAllocation) {
  return { portfolio, allocation }
}

function send(
  client,
  data,
  { returnImmediately = false, taskId, contextId } = {},
) {
  return client.sendMessage({
    tenant: '',
    configuration: {
      acceptedOutputModes: ['application/json'],
      returnImmediately,
    },
    message: createUserMessage({
      data,
      schemaName: taskId ? 'tax-followup-v1' : 'tax-request-v1',
      taskId,
      contextId,
    }),
  })
}

async function pollUntil(client, taskId, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const task = await client.getTask({ tenant: '', id: taskId })
    if (predicate(task)) return task
    if (Date.now() > deadline)
      throw new Error(`poll timeout; last state ${task.status.state}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('Tax agent lifecycle', () => {
  it('runs straight through to COMPLETED with the canonical plan (blocking send)', async () => {
    const { client, executor } = await startAgent()
    const task = await send(client, taxRequest(happyPortfolio()))
    expect(task.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    const plan = ExecutionPlan.parse(
      artifactData(findArtifact(task, 'execution-plan')),
    )
    expect(plan).toEqual(expectedHappyPlan)
    expect(executor.taskCount()).toBe(0)
  })

  it('pauses INPUT_REQUIRED and resumes on the SAME taskId', async () => {
    const { client, executor } = await startAgent()
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[2].purchaseDate = null

    const paused = await send(client, taxRequest(portfolio))
    expect(paused.status.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED)
    expect(extractText(paused.status.message)).toBe(
      'Purchase date for lot VTI-003 (40 shares @ $210)?',
    )
    expect(executor.taskCount()).toBeGreaterThan(0)

    const resumed = await send(
      client,
      { lotId: 'VTI-003', purchaseDate: '2024-03-15' },
      { taskId: paused.id, contextId: paused.contextId },
    )
    expect(resumed.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    const plan = ExecutionPlan.parse(
      artifactData(findArtifact(resumed, 'execution-plan')),
    )
    expect(plan).toEqual(expectedHappyPlan)
    expect(executor.taskCount()).toBe(0)
  })

  it('re-asks (stays INPUT_REQUIRED) on an unknown lotId instead of failing', async () => {
    const { client } = await startAgent()
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[2].purchaseDate = null

    const paused = await send(client, taxRequest(portfolio))
    const reasked = await send(
      client,
      { lotId: 'VTI-999', purchaseDate: '2024-03-15' },
      { taskId: paused.id, contextId: paused.contextId },
    )
    expect(reasked.status.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED)
    expect(extractText(reasked.status.message)).toMatch(
      /still waiting on the purchase date/,
    )

    const resumed = await send(
      client,
      { lotId: 'VTI-003', purchaseDate: '2024-03-15' },
      { taskId: paused.id, contextId: paused.contextId },
    )
    expect(resumed.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
  })

  it('asks again for each of several missing dates', async () => {
    const { client } = await startAgent()
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[1].purchaseDate = null // VTI-002 (loss)
    portfolio.holdings[0].lots[2].purchaseDate = null // VTI-003 (loss)

    const paused1 = await send(client, taxRequest(portfolio))
    expect(extractText(paused1.status.message)).toMatch(/VTI-002/)

    const paused2 = await send(
      client,
      { lotId: 'VTI-002', purchaseDate: '2023-08-21' },
      { taskId: paused1.id, contextId: paused1.contextId },
    )
    expect(paused2.status.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED)
    expect(extractText(paused2.status.message)).toMatch(/VTI-003/)

    const done = await send(
      client,
      { lotId: 'VTI-003', purchaseDate: '2024-03-15' },
      { taskId: paused1.id, contextId: paused1.contextId },
    )
    expect(done.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(
      ExecutionPlan.parse(artifactData(findArtifact(done, 'execution-plan'))),
    ).toEqual(expectedHappyPlan)
  })

  it('rejects a schema-invalid follow-up with -32602 at the boundary', async () => {
    const { client } = await startAgent()
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[2].purchaseDate = null
    const paused = await send(client, taxRequest(portfolio))

    let rejection
    try {
      await send(
        client,
        { lotId: 'VTI-003', purchaseDate: 'March 15, 2024' },
        { taskId: paused.id, contextId: paused.contextId },
      )
    } catch (error) {
      rejection = error
    }
    expect(rejection.envelopeCode).toBe(-32602)
  })

  it('fails when no wash-sale-safe replacement exists', async () => {
    const { client } = await startAgent()
    const task = await send(
      client,
      taxRequest(happyPortfolio(), {
        philosophy: 'custom',
        targets: [
          {
            assetClass: 'us-total-market',
            weightPct: 100,
            preferredVehicles: ['VTI', 'AAPL'],
          },
        ],
      }),
    )
    expect(task.status.state).toBe(TaskState.TASK_STATE_FAILED)
    expect(extractText(task.status.message)).toMatch(
      /no wash-sale-safe replacement/,
    )
  })

  it('cancels a WORKING task; canceling a terminal task is -32002', async () => {
    const { client, executor } = await startAgent({ simulatedDelayMs: 500 })
    const submitted = await send(client, taxRequest(happyPortfolio()), {
      returnImmediately: true,
    })
    expect(submitted.status.state).toBe(TaskState.TASK_STATE_SUBMITTED)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const canceled = await client.cancelTask({ tenant: '', id: submitted.id })
    expect(canceled.status.state).toBe(TaskState.TASK_STATE_CANCELED)

    // Canceling an already-CANCELED task is idempotent per spec…
    const again = await client.cancelTask({ tenant: '', id: submitted.id })
    expect(again.status.state).toBe(TaskState.TASK_STATE_CANCELED)

    const final = await client.getTask({ tenant: '', id: submitted.id })
    expect(final.status.state).toBe(TaskState.TASK_STATE_CANCELED)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(executor.taskCount()).toBe(0)
  })

  it('rejects canceling a COMPLETED task with -32002', async () => {
    const { client } = await startAgent()
    const done = await send(client, taxRequest(happyPortfolio()))
    expect(done.status.state).toBe(TaskState.TASK_STATE_COMPLETED)

    let rejection
    try {
      await client.cancelTask({ tenant: '', id: done.id })
    } catch (error) {
      rejection = error
    }
    expect(rejection.envelopeCode).toBe(-32002)
  })

  it('runs two concurrent tasks independently and cleans up both', async () => {
    const { client, executor } = await startAgent({ simulatedDelayMs: 60 })
    const first = await send(client, taxRequest(happyPortfolio()), {
      returnImmediately: true,
    })
    const second = await send(client, taxRequest(happyPortfolio()), {
      returnImmediately: true,
    })
    expect(first.id).not.toBe(second.id)

    const [doneFirst, doneSecond] = await Promise.all([
      pollUntil(client, first.id, (task) => isTerminal(task.status.state)),
      pollUntil(client, second.id, (task) => isTerminal(task.status.state)),
    ])
    expect(doneFirst.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(doneSecond.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(executor.taskCount()).toBe(0)
  })

  it('resubscribes to a live task (snapshot first); terminal resubscribe is -32004', async () => {
    const { client } = await startAgent({ simulatedDelayMs: 200 })
    const submitted = await send(client, taxRequest(happyPortfolio()), {
      returnImmediately: true,
    })

    const events = []
    for await (const streamResponse of client.resubscribeTask({
      tenant: '',
      id: submitted.id,
    })) {
      events.push(streamResponse)
    }
    expect(events[0].payload.$case).toBe('task')
    const last = events.at(-1)
    expect(last.payload.$case).toBe('statusUpdate')
    expect(last.payload.value.status.state).toBe(TaskState.TASK_STATE_COMPLETED)

    let rejection
    const drained = []
    try {
      for await (const event of client.resubscribeTask({
        tenant: '',
        id: submitted.id,
      })) {
        drained.push(event) // never reached — terminal tasks refuse resubscription
      }
    } catch (error) {
      rejection = error
    }
    expect(drained).toHaveLength(0)
    expect(rejection.envelopeCode).toBe(-32004)
  })
})
