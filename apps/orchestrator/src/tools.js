import { tool } from '@openai/agents'
import { z } from 'zod'
import { AssetClass, PhilosophyId } from '@wealth/schemas'
import {
  renderAllocation,
  renderPlan,
  renderPortfolio,
  shortId,
} from './render.js'

// The LLM-facing tool surface (§2 tool table): thin wrappers over the same
// a2a-actions the scripted mode uses. The model sees compact summaries and
// artifact REFS — tables render straight to the terminal, and raw financial
// payloads never enter the conversation.

function refLabel(ref) {
  return `${ref.schema}@${ref.agent}/${shortId(ref.taskId)}`
}

export function createOrchestratorTools({ actions, contextId, print }) {
  // Conversation-scoped state: which artifacts exist and whether a Tax task
  // is paused awaiting input. The LLM works with refs, not payloads.
  const state = {
    portfolio: null,
    allocation: null,
    pendingTax: null, // { taskId, question }
  }

  const standardizePortfolio = tool({
    name: 'standardize_portfolio',
    description:
      'Parse raw pasted holdings text into a validated portfolio-v1 artifact via the Portfolio Agent. Call this first, with the user paste verbatim.',
    parameters: z.object({ rawText: z.string().min(1) }),
    async execute({ rawText }) {
      const result = await actions.standardizePortfolio({ contextId, rawText })
      state.portfolio = result
      print(
        `✔ Portfolio standardized (${shortId(result.task.id)} · completed)\n`,
      )
      print(renderPortfolio(result.portfolio, result.warnings))
      return JSON.stringify({
        ref: refLabel(result.ref),
        holdings: result.portfolio.holdings.length,
        warnings: result.warnings,
      })
    },
    errorFunction: (_context, error) =>
      `Portfolio Agent rejected the input: ${error.message}`,
  })

  const deriveAllocation = tool({
    name: 'derive_allocation',
    description:
      'Derive a target allocation from an investment philosophy via the Strategy Agent (streaming). Extract the philosophy enum (and optional custom weights summing to 100) from the user text yourself.',
    parameters: z.object({
      philosophy: PhilosophyId,
      customWeights: z
        .array(
          z.object({
            assetClass: AssetClass,
            weightPct: z.number().min(0).max(100),
          }),
        )
        .nullable(),
      constraints: z
        .object({
          maxExpenseRatioPct: z.number().positive().nullable(),
          excludeSectors: z.array(z.string()).nullable(),
          preferredDomiciles: z.array(z.string()).nullable(),
        })
        .nullable(),
    }),
    async execute({ philosophy, customWeights, constraints }) {
      const request = {
        philosophy,
        ...(customWeights?.length
          ? {
              customWeights: Object.fromEntries(
                customWeights.map((entry) => [
                  entry.assetClass,
                  entry.weightPct,
                ]),
              ),
            }
          : {}),
        ...(constraints
          ? {
              constraints: Object.fromEntries(
                Object.entries(constraints).filter(
                  ([, value]) => value != null,
                ),
              ),
            }
          : {}),
      }
      const result = await actions.deriveAllocation({ contextId, request })
      state.allocation = result
      print(`✔ Allocation ready (${shortId(result.task.id)} · completed)\n`)
      print(renderAllocation(result.allocation))
      return JSON.stringify({
        ref: refLabel(result.ref),
        targets: result.allocation.targets.map(
          (target) => `${target.assetClass}:${target.weightPct}%`,
        ),
      })
    },
    errorFunction: (_context, error) =>
      `Strategy Agent rejected the philosophy: ${error.message}`,
  })

  const optimizeTaxes = tool({
    name: 'optimize_taxes',
    description:
      'Run the long-running Tax Agent task over the standardized portfolio and allocation (both must exist). May pause asking for a missing purchase date — relay the question to the user, then call answer_tax_question.',
    parameters: z.object({}),
    async execute() {
      if (!state.portfolio || !state.allocation) {
        return 'Cannot optimize yet: standardize_portfolio and derive_allocation must run first.'
      }
      const submitted = await actions.startTaxTask({
        contextId,
        portfolio: state.portfolio.portfolio,
        allocation: state.allocation.allocation,
      })
      print(
        `⟳ Tax Agent (task ${shortId(submitted.id)} · submitted) — polling…`,
      )
      const outcome = await actions.pollTaxTask({ taskId: submitted.id })
      return finishTaxOutcome(submitted.id, outcome)
    },
    errorFunction: (_context, error) =>
      `Tax Agent call failed: ${error.message}`,
  })

  const answerTaxQuestion = tool({
    name: 'answer_tax_question',
    description:
      'Continue a paused Tax task by supplying the missing purchase date (ISO YYYY-MM-DD) for the lot it asked about.',
    parameters: z.object({
      lotId: z.string().min(1),
      purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    async execute({ lotId, purchaseDate }) {
      if (!state.pendingTax) {
        return 'No Tax task is awaiting input.'
      }
      const outcome = await actions.answerTaxQuestion({
        taskId: state.pendingTax.taskId,
        contextId,
        lotId,
        purchaseDate,
      })
      return finishTaxOutcome(state.pendingTax.taskId, outcome)
    },
    errorFunction: (_context, error) =>
      `Tax follow-up failed: ${error.message}`,
  })

  function finishTaxOutcome(taskId, outcome) {
    if (outcome.state === 'input-required') {
      state.pendingTax = { taskId, question: outcome.question }
      return JSON.stringify({
        paused: true,
        taskId: shortId(taskId),
        question: outcome.question,
      })
    }
    state.pendingTax = null
    if (outcome.state === 'completed') {
      print(
        `✔ Execution plan ready (${shortId(outcome.task.id)} · completed)\n`,
      )
      print(renderPlan(outcome.plan))
      return JSON.stringify({
        ref: refLabel(outcome.ref),
        actions: outcome.plan.actions.length,
        estimatedTaxSavings: outcome.plan.estimatedTaxSavings,
        washSaleWarnings: outcome.plan.washSaleWarnings,
      })
    }
    if (outcome.state === 'canceled') {
      return `Tax task ${shortId(taskId)} was canceled.`
    }
    return `Tax task failed: ${outcome.reason}`
  }

  return {
    tools: [
      standardizePortfolio,
      deriveAllocation,
      optimizeTaxes,
      answerTaxQuestion,
    ],
    state,
  }
}
