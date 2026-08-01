// Demo 04 — the long-running async task lifecycle (Flow C, Tax Agent)
//
// Teaches: non-blocking SendMessage returning a SUBMITTED snapshot, GetTask
// polling through WORKING to COMPLETED, artifact retrieval from the terminal
// task — plus the FAILED terminal state (wash-sale trap variant).

import assert from 'node:assert/strict'
import { TaskState } from '@a2a-js/sdk'
import {
  createRemoteClientFactory,
  createUserMessage,
  extractText,
  isTerminal,
} from '@wealth/a2a-common'
import {
  ExecutionPlan,
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
} from '@wealth/schemas'
import { assertArtifact, assertState, assertTask } from './lib/asserts.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

function happyPortfolio() {
  return {
    portfolioId: 'pf-demo-04',
    asOf: '2026-07-29T00:00:00.000Z',
    holdings: structuredClone(expectedHappyHoldings),
    uninvestedCash: structuredClone(expectedHappyCash),
  }
}

async function pollUntilTerminal(client, taskId, onState) {
  for (;;) {
    const task = await client.getTask({ tenant: '', id: taskId })
    onState(task.status.state)
    if (isTerminal(task.status.state)) return task
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

await runDemo('04-task-lifecycle', async () => {
  const mesh = await spawnAgents(['tax'], {
    portBase: 14040,
    env: { TAX_SIMULATED_DELAY_MS: '400' },
  })
  try {
    const factory = createRemoteClientFactory({ timeoutMs: 10_000 })
    const client = await factory.createFromUrl(mesh.urls.tax)

    // Non-blocking send: the response is the SUBMITTED snapshot, not the result.
    const submitted = assertTask(
      await client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: true,
        },
        message: createUserMessage({
          data: {
            portfolio: happyPortfolio(),
            allocation: expectedBogleheadsAllocation,
          },
          schemaName: 'tax-request-v1',
        }),
      }),
    )
    assertState(submitted, TaskState.TASK_STATE_SUBMITTED)
    step('non-blocking send returned a SUBMITTED task snapshot')

    // Poll GetTask until terminal, recording the states we observed.
    const observed = new Set()
    const done = await pollUntilTerminal(client, submitted.id, (state) =>
      observed.add(state),
    )
    assert.ok(
      observed.has(TaskState.TASK_STATE_WORKING),
      'polling should observe WORKING before terminal',
    )
    assertState(done, TaskState.TASK_STATE_COMPLETED)
    step('GetTask polling observed submitted → working → completed')

    const plan = assertArtifact(
      done,
      'execution-plan',
      ExecutionPlan,
      expectedHappyPlan,
    )
    assert.equal(plan.estimatedTaxSavings, 392.63)
    step(
      'execution-plan-v1 artifact matches the canonical greedy plan ($392.63 savings)',
    )

    // FAILED variant: an allocation whose only replacement candidates are the
    // symbols being sold leaves no wash-sale-safe redeployment.
    const trapped = await client.sendMessage({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['application/json'],
        returnImmediately: false,
      },
      message: createUserMessage({
        data: {
          portfolio: happyPortfolio(),
          allocation: {
            philosophy: 'custom',
            targets: [
              {
                assetClass: 'us-total-market',
                weightPct: 100,
                preferredVehicles: ['VTI', 'AAPL'],
              },
            ],
          },
        },
        schemaName: 'tax-request-v1',
      }),
    })
    assertState(trapped, TaskState.TASK_STATE_FAILED)
    assert.match(
      extractText(trapped.status.message),
      /no wash-sale-safe replacement/,
    )
    step('wash-sale trap → FAILED terminal state with an explanatory message')
  } finally {
    await mesh.teardown()
  }
})
