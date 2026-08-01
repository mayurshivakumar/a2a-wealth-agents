import { TaskState } from '@a2a-js/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import {
  artifactData,
  createA2AServer,
  createRemoteClientFactory,
  createUserMessage,
  findArtifact,
  listTasksParams,
} from '@wealth/a2a-common'
import {
  Portfolio,
  expectedHappyCash,
  expectedHappyHoldings,
  garbagePaste,
  happyPathPaste,
} from '@wealth/schemas'
import { portfolioCardFor } from '../src/card.js'
import {
  createPortfolioExecutor,
  createPortfolioRequestValidator,
} from '../src/executor.js'

const applications = []

async function startAgent() {
  const application = createA2AServer({
    host: 'localhost',
    port: 0,
    cardFor: portfolioCardFor,
    executor: createPortfolioExecutor(),
    validateRequest: createPortfolioRequestValidator(),
  })
  const baseUrl = await application.start()
  applications.push(application)
  const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
  return { client: await factory.createFromUrl(baseUrl) }
}

function request(message) {
  return {
    tenant: '',
    configuration: {
      acceptedOutputModes: ['application/json'],
      returnImmediately: false,
    },
    message,
  }
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('Portfolio agent over A2A', () => {
  it('returns a completed task with a valid portfolio-v1 artifact (text part)', async () => {
    const { client } = await startAgent()
    const result = await client.sendMessage(
      request(createUserMessage({ text: happyPathPaste })),
    )

    expect('messageId' in result).toBe(false)
    expect(result.status.state).toBe(TaskState.TASK_STATE_COMPLETED)

    const artifact = findArtifact(result, 'standardized-holdings')
    expect(artifact.metadata).toMatchObject({
      schema: 'portfolio-v1',
      warnings: [],
    })
    const portfolio = Portfolio.parse(artifactData(artifact))
    expect(portfolio.holdings).toEqual(expectedHappyHoldings)
    expect(portfolio.uninvestedCash).toEqual(expectedHappyCash)
  })

  it('accepts a portfolio-request-v1 data part', async () => {
    const { client } = await startAgent()
    const result = await client.sendMessage(
      request(
        createUserMessage({
          data: { rawText: happyPathPaste },
          schemaName: 'portfolio-request-v1',
        }),
      ),
    )
    expect(result.status.state).toBe(TaskState.TASK_STATE_COMPLETED)
    expect(
      Portfolio.parse(artifactData(findArtifact(result))).holdings,
    ).toHaveLength(4)
  })

  it('rejects garbage input with -32602 and the Zod issue list, creating no task', async () => {
    const { client } = await startAgent()
    let rejection
    try {
      await client.sendMessage(
        request(createUserMessage({ text: garbagePaste })),
      )
    } catch (error) {
      rejection = error
    }
    expect(rejection).toBeDefined()
    expect(rejection.name).toBe('RequestMalformedError')
    expect(rejection.envelopeCode).toBe(-32602)
    expect(rejection.message).toMatch(/symbol\/quantity/)

    const tasks = await client.listTasks(listTasksParams())
    expect(tasks.tasks ?? []).toHaveLength(0)
  })
})
