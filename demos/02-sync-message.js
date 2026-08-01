// Demo 02 — synchronous SendMessage (Flow A, Portfolio Agent)
//
// Teaches: blocking send returning a completed Task inline, data/text Parts
// in → artifact out, and schema rejection as a wire-level -32602 with the
// Zod issue list (no task record created).

import assert from 'node:assert/strict'
import { TaskState } from '@a2a-js/sdk'
import {
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
import {
  assertArtifact,
  assertRpcError,
  assertState,
  assertTask,
} from './lib/asserts.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

await runDemo('02-sync-message', async () => {
  const mesh = await spawnAgents(['portfolio'], { portBase: 14020 })
  try {
    const factory = createRemoteClientFactory({ timeoutMs: 10_000 })
    const client = await factory.createFromUrl(mesh.urls.portfolio)

    // Happy path: messy paste as a text Part, blocking send.
    const result = assertTask(
      await client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: false,
        },
        message: createUserMessage({ text: happyPathPaste }),
      }),
    )
    assertState(result, TaskState.TASK_STATE_COMPLETED)
    const portfolio = assertArtifact(result, 'standardized-holdings', Portfolio)
    assert.deepEqual(portfolio.holdings, expectedHappyHoldings)
    assert.deepEqual(portfolio.uninvestedCash, expectedHappyCash)
    assert.match(portfolio.portfolioId, /^pf-/)
    assert.ok(!Number.isNaN(Date.parse(portfolio.asOf)))
    assert.deepEqual(
      findArtifact(result, 'standardized-holdings').metadata.warnings,
      [],
    )
    step(
      'happy path: completed Task with a canonical portfolio-v1 artifact (prices stamped)',
    )

    // Error branch: garbage input → RequestMalformedError (-32602) on the wire.
    let rejection
    try {
      await client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: false,
        },
        message: createUserMessage({ text: garbagePaste }),
      })
    } catch (error) {
      rejection = error
    }
    assertRpcError(
      rejection,
      -32602,
      /expected at least one recognizable symbol\/quantity pair/,
    )
    const tasks = await client.listTasks(listTasksParams())
    assert.equal(
      (tasks.tasks ?? []).length,
      1,
      'rejection must not create a task record',
    )
    step(
      'rejection: -32602 RequestMalformedError with issue list; no task record created',
    )
  } finally {
    await mesh.teardown()
  }
})
