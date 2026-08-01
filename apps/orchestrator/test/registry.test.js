import { TaskState } from '@a2a-js/sdk'
import { describe, expect, it } from 'vitest'
import { createRegistry } from '../src/registry.js'

function makeRegistry() {
  let tick = 0
  return createRegistry({
    clock: () => new Date(1700000000000 + tick++ * 1000),
    idFactory: () => 'abcdef1234567890',
  })
}

describe('task registry', () => {
  it('records, updates, and timestamps tasks with its own clock', () => {
    const registry = makeRegistry()
    registry.record({
      taskId: 'tx-1111',
      agent: 'tax',
      agentUrl: 'http://localhost:4003',
      contextId: 'ctx-1',
      state: TaskState.TASK_STATE_SUBMITTED,
    })
    const before = registry.get('tx-1111').updatedAt
    registry.update('tx-1111', TaskState.TASK_STATE_WORKING)
    const entry = registry.get('tx-1111')
    expect(entry.state).toBe(TaskState.TASK_STATE_WORKING)
    expect(entry.updatedAt > before).toBe(true)
  })

  it('resolves unambiguous prefixes only', () => {
    const registry = makeRegistry()
    registry.record({
      taskId: 'tx-aaaa',
      agent: 'tax',
      contextId: 'c',
      state: 1,
    })
    registry.record({
      taskId: 'tx-aabb',
      agent: 'tax',
      contextId: 'c',
      state: 1,
    })
    expect(registry.byPrefix('tx-aaa')).toMatchObject({ taskId: 'tx-aaaa' })
    expect(registry.byPrefix('tx-aa')).toBeUndefined()
    expect(registry.byPrefix('zz')).toBeUndefined()
  })

  it('groups by context and caches artifacts by ref', () => {
    const registry = makeRegistry()
    registry.record({
      taskId: 'pf-1',
      agent: 'portfolio',
      contextId: 'ctx-1',
      state: 3,
    })
    registry.record({
      taskId: 'st-1',
      agent: 'strategy',
      contextId: 'ctx-1',
      state: 3,
    })
    registry.record({
      taskId: 'pf-2',
      agent: 'portfolio',
      contextId: 'ctx-2',
      state: 3,
    })

    expect(registry.byContext('ctx-1').map((entry) => entry.taskId)).toEqual([
      'pf-1',
      'st-1',
    ])
    expect(registry.contexts()).toEqual(['ctx-1', 'ctx-2'])

    const ref = {
      agent: 'portfolio',
      taskId: 'pf-1',
      contextId: 'ctx-1',
      artifactId: 'standardized-holdings',
      schema: 'portfolio-v1',
    }
    registry.saveArtifact(ref, { portfolioId: 'pf-x' })
    expect(registry.getArtifact(ref)).toEqual({ portfolioId: 'pf-x' })
    expect(registry.get('pf-1').artifactName).toBe('standardized-holdings')
  })

  it('mints ctx- prefixed context ids', () => {
    expect(makeRegistry().newContextId()).toBe('ctx-abcdef12')
  })
})
