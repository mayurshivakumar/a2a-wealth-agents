import { TaskState } from '@a2a-js/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createA2AServer, createRemoteClientFactory } from '@wealth/a2a-common'
import {
  expectedBogleheadsAllocation,
  expectedHappyHoldings,
  expectedHappyPlan,
  garbagePaste,
  happyPathPaste,
  missingDatePaste,
} from '@wealth/schemas'
import { portfolioCardFor } from '../../portfolio-agent/src/card.js'
import {
  createPortfolioExecutor,
  createPortfolioRequestValidator,
} from '../../portfolio-agent/src/executor.js'
import { strategyCardFor } from '../../strategy-agent/src/card.js'
import {
  createStrategyExecutor,
  createStrategyRequestValidator,
} from '../../strategy-agent/src/executor.js'
import { taxCardFor } from '../../tax-agent/src/card.js'
import {
  createTaxExecutor,
  createTaxRequestValidator,
} from '../../tax-agent/src/executor.js'
import { createActions } from '../src/a2a-actions.js'
import { discoverAgents } from '../src/discovery.js'
import { createRegistry } from '../src/registry.js'

const applications = []
let agents
let registry
let actions

const testConfig = {
  getTaskPollMs: 25,
  inputRequiredReminderMs: 60_000,
  sseReconnect: { attempts: 3, baseMs: 10 },
  requestTimeoutMs: 5_000,
}

async function startMesh() {
  const specs = [
    {
      cardFor: portfolioCardFor,
      executor: createPortfolioExecutor(),
      validateRequest: createPortfolioRequestValidator(),
    },
    {
      cardFor: strategyCardFor,
      executor: createStrategyExecutor(),
      validateRequest: createStrategyRequestValidator(),
    },
    {
      cardFor: taxCardFor,
      executor: createTaxExecutor({ simulatedDelayMs: 10 }),
      validateRequest: createTaxRequestValidator(),
    },
  ]
  const urls = {}
  const names = ['portfolio', 'strategy', 'tax']
  for (const [index, spec] of specs.entries()) {
    const application = createA2AServer({ host: 'localhost', port: 0, ...spec })
    urls[names[index]] = await application.start()
    applications.push(application)
  }
  return urls
}

beforeEach(async () => {
  const urls = await startMesh()
  const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
  agents = await discoverAgents({ urls, factory })
  registry = createRegistry()
  actions = createActions({ agents, registry, config: testConfig })
})

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('discovery', () => {
  it('finds all three agents online with compatible schema tags', () => {
    for (const name of ['portfolio', 'strategy', 'tax']) {
      expect(agents[name].status).toBe('online')
      expect(agents[name].skill).toBeDefined()
    }
  })

  it('marks unreachable agents offline instead of crashing', async () => {
    const factory = createRemoteClientFactory({ timeoutMs: 500 })
    const broken = await discoverAgents({
      urls: {
        portfolio: agents.portfolio.url,
        strategy: agents.strategy.url,
        tax: 'http://localhost:9',
      },
      factory,
    })
    expect(broken.portfolio.status).toBe('online')
    expect(broken.tax.status).toBe('offline')
    expect(broken.tax.reason).toBeTruthy()
  })
})

describe('actions over the real mesh', () => {
  it('standardizePortfolio returns a validated portfolio + ref + registry entry', async () => {
    const result = await actions.standardizePortfolio({
      contextId: 'ctx-test',
      rawText: happyPathPaste,
    })
    expect(result.portfolio.holdings).toEqual(expectedHappyHoldings)
    expect(result.warnings).toEqual([])
    expect(result.ref.schema).toBe('portfolio-v1')
    expect(registry.get(result.task.id).state).toBe(
      TaskState.TASK_STATE_COMPLETED,
    )
    expect(registry.getArtifact(result.ref)).toEqual(result.portfolio)
  })

  it('surfaces -32602 rejections without creating registry entries', async () => {
    await expect(
      actions.standardizePortfolio({
        contextId: 'ctx-test',
        rawText: garbagePaste,
      }),
    ).rejects.toMatchObject({ envelopeCode: -32602 })
    expect(registry.all()).toHaveLength(0)
  })

  it('deriveAllocation streams to a validated allocation-v1', async () => {
    const statuses = []
    const result = await actions.deriveAllocation({
      contextId: 'ctx-test',
      request: { philosophy: 'bogleheads-three-fund' },
      onStatus: (update) => statuses.push(update.status.state),
    })
    expect(result.allocation).toEqual(expectedBogleheadsAllocation)
    expect(statuses).toContain(TaskState.TASK_STATE_WORKING)
    expect(registry.get(result.task.id).state).toBe(
      TaskState.TASK_STATE_COMPLETED,
    )
  })

  it('runs the full tax flow: input-required → wrong lot re-ask → resume → plan', async () => {
    const { portfolio } = await actions.standardizePortfolio({
      contextId: 'ctx-test',
      rawText: missingDatePaste,
    })
    const { allocation } = await actions.deriveAllocation({
      contextId: 'ctx-test',
      request: { philosophy: 'bogleheads-three-fund' },
    })

    const submitted = await actions.startTaxTask({
      contextId: 'ctx-test',
      portfolio,
      allocation,
    })
    expect(submitted.status.state).toBe(TaskState.TASK_STATE_SUBMITTED)

    const paused = await actions.pollTaxTask({ taskId: submitted.id })
    expect(paused.state).toBe('input-required')
    expect(paused.question).toBe(
      'Purchase date for lot VTI-003 (40 shares @ $210)?',
    )

    const reasked = await actions.answerTaxQuestion({
      taskId: submitted.id,
      contextId: 'ctx-test',
      lotId: 'VTI-999',
      purchaseDate: '2024-03-15',
    })
    expect(reasked.state).toBe('input-required')

    const done = await actions.answerTaxQuestion({
      taskId: submitted.id,
      contextId: 'ctx-test',
      lotId: 'VTI-003',
      purchaseDate: '2024-03-15',
    })
    expect(done.state).toBe('completed')
    expect(done.plan).toEqual(expectedHappyPlan)
    expect(registry.get(submitted.id).state).toBe(
      TaskState.TASK_STATE_COMPLETED,
    )

    // Every task of the conversation shares the contextId.
    const contexts = new Set(registry.all().map((entry) => entry.contextId))
    expect(contexts).toEqual(new Set(['ctx-test']))
  })

  it('cancels a running tax task through the registry', async () => {
    await applications.at(-1).stop()
    const slowTax = createA2AServer({
      host: 'localhost',
      port: 0,
      cardFor: taxCardFor,
      executor: createTaxExecutor({ simulatedDelayMs: 500 }),
      validateRequest: createTaxRequestValidator(),
    })
    const url = await slowTax.start()
    applications.push(slowTax)
    const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
    agents = await discoverAgents({
      urls: {
        portfolio: agents.portfolio.url,
        strategy: agents.strategy.url,
        tax: url,
      },
      factory,
    })
    actions = createActions({ agents, registry, config: testConfig })

    const portfolio = {
      portfolioId: 'pf-cancel',
      asOf: '2026-07-29T00:00:00.000Z',
      holdings: structuredClone(expectedHappyHoldings),
      uninvestedCash: [],
    }
    const submitted = await actions.startTaxTask({
      contextId: 'ctx-cancel',
      portfolio,
      allocation: expectedBogleheadsAllocation,
    })
    const canceled = await actions.cancelTask({ taskId: submitted.id })
    expect(canceled.status.state).toBe(TaskState.TASK_STATE_CANCELED)
    expect(registry.get(submitted.id).state).toBe(TaskState.TASK_STATE_CANCELED)
  })

  it('listRemoteTasks reconciles registry entries against every agent', async () => {
    await actions.standardizePortfolio({
      contextId: 'ctx-test',
      rawText: happyPathPaste,
    })
    const remote = await actions.listRemoteTasks()
    expect(remote.portfolio).toHaveLength(1)
    expect(remote.strategy).toHaveLength(0)
    expect(remote.tax).toHaveLength(0)
  })
})
