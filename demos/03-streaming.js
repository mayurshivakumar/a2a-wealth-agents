// Demo 03 — streaming send over SSE (Flow B, Strategy Agent)
//
// Teaches: SendStreamingMessage on the wire, StreamResponse consumption via
// payload.$case, incremental statusUpdate → artifactUpdate ordering, and the
// terminal state closing the stream (v1.0 has no `final` flag).

import assert from 'node:assert/strict'
import { TaskState } from '@a2a-js/sdk'
import {
  artifactData,
  createRemoteClientFactory,
  createUserMessage,
  extractText,
} from '@wealth/a2a-common'
import { Allocation, expectedBogleheadsAllocation } from '@wealth/schemas'
import { assertRpcError, assertState } from './lib/asserts.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

await runDemo('03-streaming', async () => {
  const mesh = await spawnAgents(['strategy'], { portBase: 14030 })
  try {
    const factory = createRemoteClientFactory({ timeoutMs: 10_000 })
    const client = await factory.createFromUrl(mesh.urls.strategy)

    const events = []
    for await (const streamResponse of client.sendMessageStream({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['application/json'],
        returnImmediately: true,
      },
      message: createUserMessage({
        data: { philosophy: 'bogleheads-three-fund' },
        schemaName: 'strategy-request-v1',
      }),
    })) {
      events.push(streamResponse)
    }

    // Exact event order; the loop ending proves the terminal state closed
    // the stream.
    assert.deepEqual(
      events.map((event) => event.payload.$case),
      [
        'task',
        'statusUpdate',
        'statusUpdate',
        'artifactUpdate',
        'statusUpdate',
      ],
    )
    const [task, working1, working2, artifactUpdate, completed] = events.map(
      (event) => event.payload.value,
    )
    assert.equal(task.status.state, TaskState.TASK_STATE_SUBMITTED)
    assert.equal(
      extractText(working1.status.message),
      'interpreting philosophy',
    )
    assert.equal(
      extractText(working2.status.message),
      'computing target weights',
    )
    assert.equal(artifactUpdate.lastChunk, true)
    assert.equal(completed.status.state, TaskState.TASK_STATE_COMPLETED)
    step(
      'SSE event order: task → working ×2 → artifactUpdate(lastChunk) → completed closes stream',
    )

    const allocation = Allocation.parse(artifactData(artifactUpdate.artifact))
    assert.deepEqual(allocation, expectedBogleheadsAllocation)
    step('allocation-v1 artifact matches the D4 table + vehicle lookup')

    // The task (and artifact) survive the stream: GetTask sees the terminal state.
    const persisted = await client.getTask({ tenant: '', id: task.id })
    assertState(persisted, TaskState.TASK_STATE_COMPLETED)
    assert.equal(persisted.artifacts.length, 1)
    step(
      'GetTask after the stream shows the persisted completed task + artifact',
    )

    // Error branch: unknown philosophy rejects on the wire, no task record.
    let rejection
    try {
      await client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: false,
        },
        message: createUserMessage({ text: 'maximum yolo growth' }),
      })
    } catch (error) {
      rejection = error
    }
    assertRpcError(rejection, -32602, /unrecognized philosophy/)
    step('rejection: unknown philosophy → -32602 RequestMalformedError')
  } finally {
    await mesh.teardown()
  }
})
