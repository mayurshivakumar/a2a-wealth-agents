import { readFileSync, readdirSync } from 'node:fs'
import { TaskState } from '@a2a-js/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  expectedBogleheadsAllocation,
  expectedHappyPlan,
} from '@wealth/schemas'
import { createOrchestratorTools } from '../src/tools.js'

const srcDir = new URL('../src/', import.meta.url)

describe('scripted/LLM module boundary', () => {
  it('only llm.js and tools.js reference @openai/agents; index.js loads llm.js dynamically', () => {
    const allowed = new Set(['llm.js', 'tools.js'])
    for (const file of readdirSync(srcDir).filter((name) =>
      name.endsWith('.js'),
    )) {
      const source = readFileSync(new URL(file, srcDir), 'utf8')
      if (!allowed.has(file)) {
        expect(source, `${file} must not import @openai/agents`).not.toMatch(
          /(from\s+'@openai\/agents'|import\('@openai\/agents'\))/,
        )
      }
      if (file === 'index.js') {
        expect(source).toContain("import('./llm.js')")
        expect(source).not.toMatch(/^import .*'\.\/llm\.js'/m)
        expect(source).not.toMatch(/^import .*'\.\/tools\.js'/m)
      }
    }
  })
})

describe('orchestrator tools over mocked actions', () => {
  function makeTools() {
    const printed = []
    const actions = {
      standardizePortfolio: vi.fn(async () => ({
        task: {
          id: 'pf-11112222',
          status: { state: TaskState.TASK_STATE_COMPLETED },
        },
        ref: {
          agent: 'portfolio',
          taskId: 'pf-11112222',
          contextId: 'ctx-1',
          artifactId: 'standardized-holdings',
          schema: 'portfolio-v1',
        },
        portfolio: {
          portfolioId: 'pf-x',
          asOf: '2026-07-29T00:00:00.000Z',
          holdings: [
            {
              accountId: 'fid-tax-001',
              accountType: 'taxable',
              symbol: 'AAPL',
              lots: [
                {
                  lotId: 'AAPL-001',
                  quantity: 40,
                  costBasis: 145,
                  purchaseDate: '2021-06-02',
                },
              ],
              currentPrice: 114,
              priceAsOf: '2026-07-28T16:00:00Z',
            },
          ],
          uninvestedCash: [],
        },
        warnings: [],
      })),
      deriveAllocation: vi.fn(async ({ request }) => ({
        task: {
          id: 'st-11112222',
          status: { state: TaskState.TASK_STATE_COMPLETED },
        },
        ref: {
          agent: 'strategy',
          taskId: 'st-11112222',
          contextId: 'ctx-1',
          artifactId: 'target-allocation',
          schema: 'allocation-v1',
        },
        allocation: expectedBogleheadsAllocation,
        request,
      })),
      startTaxTask: vi.fn(async () => ({
        id: 'tx-11112222',
        status: { state: TaskState.TASK_STATE_SUBMITTED },
      })),
      pollTaxTask: vi.fn(async () => ({
        state: 'input-required',
        task: { id: 'tx-11112222' },
        question: 'Purchase date for lot VTI-003 (40 shares @ $210)?',
      })),
      answerTaxQuestion: vi.fn(async () => ({
        state: 'completed',
        task: { id: 'tx-11112222' },
        ref: {
          agent: 'tax',
          taskId: 'tx-11112222',
          contextId: 'ctx-1',
          artifactId: 'execution-plan',
          schema: 'execution-plan-v1',
        },
        plan: expectedHappyPlan,
      })),
    }
    const { tools, state } = createOrchestratorTools({
      actions,
      contextId: 'ctx-1',
      print: (text) => printed.push(text),
    })
    const byName = Object.fromEntries(tools.map((entry) => [entry.name, entry]))
    return { byName, actions, state, printed }
  }

  it('exposes the four Slice 0 tools with the documented names', () => {
    const { byName } = makeTools()
    expect(Object.keys(byName).sort()).toEqual([
      'answer_tax_question',
      'derive_allocation',
      'optimize_taxes',
      'standardize_portfolio',
    ])
  })

  it('standardize → derive → optimize pauses, then answer completes with refs', async () => {
    const { byName, actions, state, printed } = makeTools()

    const portfolioSummary = JSON.parse(
      await byName.standardize_portfolio.invoke(
        null,
        JSON.stringify({ rawText: 'paste' }),
      ),
    )
    expect(portfolioSummary.ref).toBe('portfolio-v1@portfolio/pf-11112')
    expect(state.portfolio).toBeTruthy()

    await byName.derive_allocation.invoke(
      null,
      JSON.stringify({
        philosophy: 'bogleheads-three-fund',
        customWeights: null,
        constraints: {
          maxExpenseRatioPct: 0.1,
          excludeSectors: null,
          preferredDomiciles: null,
        },
      }),
    )
    expect(actions.deriveAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          philosophy: 'bogleheads-three-fund',
          constraints: { maxExpenseRatioPct: 0.1 },
        },
      }),
    )

    const paused = JSON.parse(
      await byName.optimize_taxes.invoke(null, JSON.stringify({})),
    )
    expect(paused.paused).toBe(true)
    expect(paused.question).toMatch(/VTI-003/)
    expect(state.pendingTax).toMatchObject({ taskId: 'tx-11112222' })

    const done = JSON.parse(
      await byName.answer_tax_question.invoke(
        null,
        JSON.stringify({ lotId: 'VTI-003', purchaseDate: '2024-03-15' }),
      ),
    )
    expect(done.estimatedTaxSavings).toBe(392.63)
    expect(state.pendingTax).toBeNull()
    expect(printed.join('\n')).toContain('Estimated tax savings: $392.63')
  })

  it('optimize_taxes refuses to run before both artifacts exist', async () => {
    const { byName } = makeTools()
    const result = await byName.optimize_taxes.invoke(null, JSON.stringify({}))
    expect(result).toMatch(/must run first/)
  })
})
