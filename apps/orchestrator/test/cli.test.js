import { PassThrough } from 'node:stream'
import { TaskState } from '@a2a-js/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
} from '@wealth/schemas'
import { createCli } from '../src/cli.js'
import { createRegistry } from '../src/registry.js'

// CLI state-machine tests with mocked actions and fake timers (only
// setTimeout/clearTimeout are faked so promises and IO stay real).

const QUESTION = 'Purchase date for lot VTI-003 (40 shares @ $210)?'

function fixtures() {
  const portfolio = {
    portfolioId: 'pf-cli',
    asOf: '2026-07-29T00:00:00.000Z',
    holdings: structuredClone(expectedHappyHoldings),
    uninvestedCash: structuredClone(expectedHappyCash),
  }
  return { portfolio }
}

function makeHarness({ pauseTax = false } = {}) {
  const registry = createRegistry()
  const { portfolio } = fixtures()
  const output = new PassThrough()
  let rendered = ''
  output.on('data', (chunk) => {
    rendered += chunk.toString()
  })
  const input = new PassThrough()

  const agents = {
    portfolio: {
      name: 'portfolio',
      url: 'http://localhost:4001',
      status: 'online',
      card: { name: 'Portfolio Agent', skills: [] },
    },
    strategy: {
      name: 'strategy',
      url: 'http://localhost:4002',
      status: 'online',
      card: { name: 'Strategy Agent', skills: [] },
    },
    tax: {
      name: 'tax',
      url: 'http://localhost:4003',
      status: 'online',
      card: { name: 'Tax Agent', skills: [] },
    },
  }

  let resolvePausedPoll
  const actions = {
    standardizePortfolio: vi.fn(async ({ contextId }) => {
      registry.record({
        taskId: 'pf-11111111',
        agent: 'portfolio',
        agentUrl: agents.portfolio.url,
        contextId,
        state: TaskState.TASK_STATE_COMPLETED,
      })
      return {
        task: {
          id: 'pf-11111111',
          contextId,
          status: { state: TaskState.TASK_STATE_COMPLETED },
        },
        ref: {},
        portfolio,
        warnings: [],
      }
    }),
    deriveAllocation: vi.fn(async ({ contextId }) => {
      registry.record({
        taskId: 'st-11111111',
        agent: 'strategy',
        agentUrl: agents.strategy.url,
        contextId,
        state: TaskState.TASK_STATE_COMPLETED,
      })
      return {
        task: {
          id: 'st-11111111',
          contextId,
          status: { state: TaskState.TASK_STATE_COMPLETED },
        },
        ref: {},
        allocation: expectedBogleheadsAllocation,
      }
    }),
    startTaxTask: vi.fn(async ({ contextId }) => {
      registry.record({
        taskId: 'tx-11111111',
        agent: 'tax',
        agentUrl: agents.tax.url,
        contextId,
        state: TaskState.TASK_STATE_SUBMITTED,
      })
      return {
        id: 'tx-11111111',
        contextId,
        status: { state: TaskState.TASK_STATE_SUBMITTED },
      }
    }),
    pollTaxTask: vi.fn(async ({ taskId }) => {
      if (pauseTax) {
        return {
          state: 'input-required',
          task: { id: taskId },
          question: QUESTION,
        }
      }
      return {
        state: 'completed',
        task: { id: taskId },
        plan: expectedHappyPlan,
      }
    }),
    answerTaxQuestion: vi.fn(async ({ taskId }) => ({
      state: 'completed',
      task: { id: taskId },
      plan: expectedHappyPlan,
    })),
    cancelTask: vi.fn(async ({ taskId }) => {
      registry.update(taskId, TaskState.TASK_STATE_CANCELED)
      return {
        id: taskId,
        status: { state: TaskState.TASK_STATE_CANCELED },
        ...(resolvePausedPoll ? resolvePausedPoll() : {}),
      }
    }),
    listRemoteTasks: vi.fn(async () => ({})),
  }

  const cli = createCli({
    agents,
    registry,
    actions,
    config: {
      inputRequiredReminderMs: 60_000,
      getTaskPollMs: 2_000,
      sseReconnect: { attempts: 3, baseMs: 1000 },
    },
    input,
    output,
  })

  return {
    cli,
    actions,
    registry,
    input,
    outputText: () => rendered,
    type: (line) => input.write(`${line}\n`),
  }
}

async function flush(times = 20) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

async function until(harness, needle, attempts = 200) {
  for (let index = 0; index < attempts; index += 1) {
    if (harness.outputText().includes(needle)) return
    await flush(5)
  }
  throw new Error(
    `output never contained ${JSON.stringify(needle)}\n---\n${harness.outputText()}`,
  )
}

let runPromise

afterEach(async () => {
  vi.useRealTimers()
})

describe('scripted CLI state machine', () => {
  it('drives paste → philosophy → confirm → plan and renders from artifacts', async () => {
    const harness = makeHarness()
    runPromise = harness.cli.start()

    await until(harness, 'Paste your holdings to begin.')
    harness.type('Fidelity taxable account: 40 AAPL @ $145 bought 2021-06-02')
    await until(harness, 'What investment philosophy')
    harness.type('1')
    await until(harness, 'Generate the tax-optimized execution plan? (y/n)')
    harness.type('y')
    await until(harness, 'Estimated tax savings: $392.63')

    expect(harness.actions.deriveAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        request: { philosophy: 'bogleheads-three-fund' },
      }),
    )
    expect(harness.outputText()).toContain('SELL')
    expect(harness.outputText()).toContain('Wash-sale warnings: none')

    harness.input.end()
    await runPromise
  })

  it('fires the 60s reminder while input-required sits unanswered, then resumes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const harness = makeHarness({ pauseTax: true })
    runPromise = harness.cli.start()

    await until(harness, 'Paste your holdings to begin.')
    harness.type('paste')
    await until(harness, 'What investment philosophy')
    harness.type('1')
    await until(harness, '(y/n)')
    harness.type('y')
    await until(harness, QUESTION)

    expect(harness.outputText()).not.toContain('still waiting')
    await vi.advanceTimersByTimeAsync(60_000)
    await until(harness, 'still waiting')
    expect(harness.outputText()).toContain('/cancel tx-11111')

    // An unparseable date re-prompts (and re-arms the reminder)…
    harness.type('sometime in spring')
    await until(harness, 'Could not parse a date')

    // …and the transcript answer resumes the task on the same taskId.
    harness.type('March 15, 2024')
    await until(harness, 'Estimated tax savings')
    expect(harness.actions.answerTaxQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'tx-11111111',
        lotId: 'VTI-003',
        purchaseDate: '2024-03-15',
      }),
    )

    harness.input.end()
    await runPromise
  })

  it('handles /commands while a task is awaiting input, including /cancel', async () => {
    const harness = makeHarness({ pauseTax: true })
    runPromise = harness.cli.start()

    await until(harness, 'Paste your holdings')
    harness.type('paste')
    await until(harness, 'philosophy')
    harness.type('1')
    await until(harness, '(y/n)')
    harness.type('y')
    await until(harness, QUESTION)

    harness.type('/tasks')
    await until(harness, 'tx-11111')
    expect(harness.outputText()).toContain('input-required')

    harness.type('/agents')
    await until(harness, '✔ tax :4003')

    harness.type('/cancel tx-1111')
    await until(harness, 'canceled')
    expect(harness.actions.cancelTask).toHaveBeenCalledWith({
      taskId: 'tx-11111111',
    })

    harness.input.end()
    await runPromise
  })

  it('re-prompts after a portfolio rejection instead of crashing', async () => {
    const harness = makeHarness()
    harness.actions.standardizePortfolio.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'holdings: expected at least one recognizable symbol/quantity pair',
        ),
        {
          name: 'RequestMalformedError',
        },
      ),
    )
    runPromise = harness.cli.start()

    await until(harness, 'Paste your holdings')
    harness.type('garbage')
    await until(harness, 'rejected the input')
    harness.type('real paste')
    await until(harness, 'What investment philosophy')

    harness.input.end()
    await runPromise
  })
})
