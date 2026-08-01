// Demo 06 — SubscribeToTask reattachment and CancelTask (Flow C endings)
//
// Teaches: reattaching a dropped stream via SubscribeToTask (snapshot first,
// then live events), CancelTask driving the canceled terminal state, spec
// idempotency of cancel-on-canceled, and the terminal-task error codes
// (-32002 cancel, -32004 resubscribe → GetTask is the fallback).

import assert from 'node:assert/strict'
import { TaskState } from '@a2a-js/sdk'
import {
  createRemoteClientFactory,
  createUserMessage,
} from '@wealth/a2a-common'
import {
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
} from '@wealth/schemas'
import { assertRpcError, assertState } from './lib/asserts.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

function happyPortfolio(id) {
  return {
    portfolioId: id,
    asOf: '2026-07-29T00:00:00.000Z',
    holdings: structuredClone(expectedHappyHoldings),
    uninvestedCash: structuredClone(expectedHappyCash),
  }
}

function taxSend(client, portfolioId) {
  return client.sendMessage({
    tenant: '',
    configuration: {
      acceptedOutputModes: ['application/json'],
      returnImmediately: true,
    },
    message: createUserMessage({
      data: {
        portfolio: happyPortfolio(portfolioId),
        allocation: expectedBogleheadsAllocation,
      },
      schemaName: 'tax-request-v1',
    }),
  })
}

await runDemo('06-cancel-resubscribe', async () => {
  const mesh = await spawnAgents(['tax'], {
    portBase: 14060,
    env: { TAX_SIMULATED_DELAY_MS: '600' },
  })
  try {
    const factory = createRemoteClientFactory({ timeoutMs: 15_000 })
    const client = await factory.createFromUrl(mesh.urls.tax)

    // (a) Subscribe to a live task, DROP the stream after the snapshot, then
    // reattach — the second subscription begins with a fresh Task snapshot.
    const running = await taxSend(client, 'pf-demo-06a')
    let firstEvent
    for await (const streamResponse of client.resubscribeTask({
      tenant: '',
      id: running.id,
    })) {
      firstEvent = streamResponse
      break // simulated client-side drop: abandon the stream mid-task
    }
    assert.equal(firstEvent.payload.$case, 'task')
    step(
      'subscribed to the live task and dropped the stream after the snapshot',
    )

    const reattached = []
    for await (const streamResponse of client.resubscribeTask({
      tenant: '',
      id: running.id,
    })) {
      reattached.push(streamResponse)
    }
    assert.equal(
      reattached[0].payload.$case,
      'task',
      'reattach starts with a Task snapshot',
    )
    const final = reattached.at(-1)
    assert.equal(
      final.payload.value.status.state,
      TaskState.TASK_STATE_COMPLETED,
    )
    step(
      'reattached via SubscribeToTask: snapshot first, then live events to COMPLETED',
    )

    // (b) Cancel a WORKING task → canceled terminal state.
    const victim = await taxSend(client, 'pf-demo-06b')
    await new Promise((resolve) => setTimeout(resolve, 100))
    const canceled = await client.cancelTask({ tenant: '', id: victim.id })
    assertState(canceled, TaskState.TASK_STATE_CANCELED)
    const confirmed = await client.getTask({ tenant: '', id: victim.id })
    assertState(confirmed, TaskState.TASK_STATE_CANCELED)
    step('CancelTask aborted the running task → canceled (terminal)')

    // Cancel-on-canceled is idempotent per spec.
    const again = await client.cancelTask({ tenant: '', id: victim.id })
    assertState(again, TaskState.TASK_STATE_CANCELED)
    step('canceling an already-canceled task is idempotent')

    // (c) Terminal-task error codes: cancel COMPLETED → -32002; resubscribe
    // any terminal task → -32004, so clients fall back to GetTask.
    let cancelRejection
    try {
      await client.cancelTask({ tenant: '', id: running.id })
    } catch (error) {
      cancelRejection = error
    }
    assertRpcError(cancelRejection, -32002)

    let resubscribeRejection
    const drained = []
    try {
      for await (const event of client.resubscribeTask({
        tenant: '',
        id: running.id,
      })) {
        drained.push(event) // never reached — terminal tasks refuse resubscription
      }
    } catch (error) {
      resubscribeRejection = error
    }
    assert.equal(drained.length, 0)
    assertRpcError(resubscribeRejection, -32004)
    const fallback = await client.getTask({ tenant: '', id: running.id })
    assertState(fallback, TaskState.TASK_STATE_COMPLETED)
    step(
      'terminal-task codes: cancel → -32002, resubscribe → -32004 with GetTask fallback',
    )
  } finally {
    await mesh.teardown()
  }
})
