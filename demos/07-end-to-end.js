// Demo 07 — the end-to-end scripted pipeline (Slice 0 exit criterion)
//
// Spawns the three agents plus the Orchestrator CLI as a child process in
// --scripted mode (no API keys — the harness scrubs them), pipes the
// transcript conversation via stdin, then asserts on the dumped ARTIFACTS
// and reconciles the orchestrator's run manifest against every agent's
// ListTasks. One contextId spans all three tasks.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TaskState } from '@a2a-js/sdk'
import { createRemoteClientFactory, listTasksParams } from '@wealth/a2a-common'
import {
  Allocation,
  ExecutionPlan,
  Portfolio,
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
  happyPathPaste,
} from '@wealth/schemas'
import { runDemo, spawnAgents, step } from './lib/harness.js'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

await runDemo('07-end-to-end', async () => {
  const mesh = await spawnAgents(['portfolio', 'strategy', 'tax'], {
    portBase: 14070,
    env: { TAX_SIMULATED_DELAY_MS: '200' },
  })
  const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'wealth-demo-07-'))
  try {
    // Drive the Orchestrator CLI exactly like a user: paste → "1" → "y".
    const child = spawn(
      process.execPath,
      ['src/index.js', '--scripted', '--artifact-dir', artifactDir],
      {
        cwd: path.join(repoRoot, 'apps/orchestrator'),
        env: { ...mesh.env, GETTASK_POLL_MS: '100' },
        stdio: ['pipe', 'pipe', 'inherit'],
      },
    )
    let transcript = ''
    child.stdout.on('data', (chunk) => {
      transcript += chunk.toString()
    })
    child.stdin.write(`${happyPathPaste}\n`)
    child.stdin.write('1\n')
    child.stdin.write('y\n')
    child.stdin.end() // EOF after the plan renders ends the session cleanly

    const exitCode = await new Promise((resolve) => child.on('exit', resolve))
    assert.equal(exitCode, 0, `orchestrator exited ${exitCode}\n${transcript}`)
    step('scripted CLI ran the full conversation with no API keys')

    // Assert on artifact CONTENTS (never console text).
    const portfolio = Portfolio.parse(
      JSON.parse(
        await readFile(
          path.join(artifactDir, 'portfolio-standardized-holdings.json'),
        ),
      ),
    )
    assert.deepEqual(portfolio.holdings, expectedHappyHoldings)
    assert.deepEqual(portfolio.uninvestedCash, expectedHappyCash)

    const allocation = Allocation.parse(
      JSON.parse(
        await readFile(
          path.join(artifactDir, 'strategy-target-allocation.json'),
        ),
      ),
    )
    assert.deepEqual(allocation, expectedBogleheadsAllocation)

    const plan = ExecutionPlan.parse(
      JSON.parse(
        await readFile(path.join(artifactDir, 'tax-execution-plan.json')),
      ),
    )
    assert.deepEqual(plan, expectedHappyPlan)
    step(
      'all three artifacts re-validated from disk and equal to the canonical fixtures',
    )

    // One contextId spans the whole conversation.
    const manifest = JSON.parse(
      await readFile(path.join(artifactDir, 'run.json')),
    )
    assert.equal(manifest.tasks.length, 3)
    const contextIds = new Set(manifest.tasks.map((task) => task.contextId))
    assert.equal(contextIds.size, 1)
    assert.match([...contextIds][0], /^ctx-/)
    assert.deepEqual(
      new Set(manifest.tasks.map((task) => task.agent)),
      new Set(['portfolio', 'strategy', 'tax']),
    )
    assert.ok(manifest.tasks.every((task) => task.state === 'completed'))
    step(
      `one contextId (${[...contextIds][0]}) spans portfolio → strategy → tax`,
    )

    // Reconcile the orchestrator's registry view against each agent's
    // ListTasks — the /tasks cross-check, asserted on wire data.
    const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
    for (const entry of manifest.tasks) {
      const client = await factory.createFromUrl(mesh.urls[entry.agent])
      const listed = await client.listTasks(listTasksParams())
      const remote = (listed.tasks ?? []).find(
        (task) => task.id === entry.taskId,
      )
      assert.ok(remote, `${entry.agent} must list task ${entry.taskId}`)
      assert.equal(remote.status.state, TaskState.TASK_STATE_COMPLETED)
      assert.equal(remote.contextId, entry.contextId)
    }
    step(
      'registry ⇄ ListTasks reconciliation: every agent confirms its task + contextId',
    )
  } finally {
    await mesh.teardown()
  }
})
