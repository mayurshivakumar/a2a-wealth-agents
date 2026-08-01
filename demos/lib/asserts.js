import assert from 'node:assert/strict'
import { artifactData, findArtifact, stateLabel } from '@wealth/a2a-common'

/**
 * Finds `name` among the task's artifacts, re-validates its data part with
 * the given Zod schema (the client-side boundary check), and optionally
 * deep-compares the contents against the canonical fixture.
 */
export function assertArtifact(task, name, schema, expected) {
  const artifact = findArtifact(task, name)
  assert.ok(artifact, `task ${task.id} has no artifact named "${name}"`)
  const data = schema.parse(artifactData(artifact))
  if (expected !== undefined) {
    assert.deepEqual(data, expected)
  }
  return data
}

export function assertState(task, state) {
  assert.equal(
    task.status.state,
    state,
    `expected task ${task.id} to be ${stateLabel(state)}, got ${stateLabel(task.status.state)}`,
  )
}

export function assertTask(result) {
  assert.ok(
    result && !('messageId' in result),
    'expected a Task result, got a Message',
  )
  return result
}

/** Asserts a rejected client call carries the expected JSON-RPC error code. */
export function assertRpcError(error, code, messagePattern) {
  assert.ok(error, `expected a JSON-RPC error (${code}), got none`)
  assert.equal(
    error.envelopeCode,
    code,
    `expected JSON-RPC code ${code}, got ${error.envelopeCode ?? '(none)'}: ${error.message}`,
  )
  if (messagePattern) {
    assert.match(error.message, messagePattern)
  }
}
