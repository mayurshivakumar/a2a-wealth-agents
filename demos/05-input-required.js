// Demo 05 — input-required and same-taskId continuation (Flow C pause)
//
// Teaches: a task pausing INPUT_REQUIRED with a question, the follow-up
// message continuing the SAME taskId (legal because input-required is
// non-terminal), the re-ask on a wrong reply, and completion after resume.

import assert from 'node:assert/strict'
import { TaskState } from '@a2a-js/sdk'
import {
  createRemoteClientFactory,
  createUserMessage,
  extractText,
} from '@wealth/a2a-common'
import {
  ExecutionPlan,
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
} from '@wealth/schemas'
import { assertArtifact, assertState } from './lib/asserts.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

function missingDatePortfolio() {
  const holdings = structuredClone(expectedHappyHoldings)
  holdings[0].lots[2].purchaseDate = null // VTI-003 — the loss lot from the transcript
  return {
    portfolioId: 'pf-demo-05',
    asOf: '2026-07-29T00:00:00.000Z',
    holdings,
    uninvestedCash: structuredClone(expectedHappyCash),
  }
}

await runDemo('05-input-required', async () => {
  const mesh = await spawnAgents(['tax'], {
    portBase: 14050,
    env: { TAX_SIMULATED_DELAY_MS: '100' },
  })
  try {
    const factory = createRemoteClientFactory({ timeoutMs: 10_000 })
    const client = await factory.createFromUrl(mesh.urls.tax)

    // Blocking sends RESOLVE at input-required — the connection is not held.
    const paused = await client.sendMessage({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['application/json'],
        returnImmediately: false,
      },
      message: createUserMessage({
        data: {
          portfolio: missingDatePortfolio(),
          allocation: expectedBogleheadsAllocation,
        },
        schemaName: 'tax-request-v1',
      }),
    })
    assertState(paused, TaskState.TASK_STATE_INPUT_REQUIRED)
    assert.equal(
      extractText(paused.status.message),
      'Purchase date for lot VTI-003 (40 shares @ $210)?',
    )
    step('task paused INPUT_REQUIRED asking for the missing purchase date')

    // A wrong reply re-asks instead of failing — the task stays continuable.
    const reasked = await client.sendMessage({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['application/json'],
        returnImmediately: false,
      },
      message: createUserMessage({
        data: { lotId: 'VTI-999', purchaseDate: '2024-03-15' },
        schemaName: 'tax-followup-v1',
        taskId: paused.id,
        contextId: paused.contextId,
      }),
    })
    assertState(reasked, TaskState.TASK_STATE_INPUT_REQUIRED)
    assert.match(
      extractText(reasked.status.message),
      /still waiting on the purchase date/,
    )
    step(
      'wrong lotId → clarifying re-ask, still INPUT_REQUIRED on the same task',
    )

    // The transcript's answer ("March 15, 2024" → 2024-03-15, parsed by the
    // Orchestrator in scripted/LLM mode) continues the SAME taskId.
    const resumed = await client.sendMessage({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['application/json'],
        returnImmediately: false,
      },
      message: createUserMessage({
        data: { lotId: 'VTI-003', purchaseDate: '2024-03-15' },
        schemaName: 'tax-followup-v1',
        taskId: paused.id,
        contextId: paused.contextId,
      }),
    })
    assert.equal(
      resumed.id,
      paused.id,
      'continuation must reuse the same taskId',
    )
    assertState(resumed, TaskState.TASK_STATE_COMPLETED)
    assertArtifact(resumed, 'execution-plan', ExecutionPlan, expectedHappyPlan)
    step(
      'follow-up on the SAME taskId resumed and completed with the canonical plan',
    )
  } finally {
    await mesh.teardown()
  }
})
