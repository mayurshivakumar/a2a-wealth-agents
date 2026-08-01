import { randomUUID } from 'node:crypto'
import { shortStateLabel } from '@wealth/a2a-common'

/**
 * The Orchestrator's in-memory view of the distributed run: taskId →
 * {agent, agentUrl, contextId, state, artifactName, updatedAt}. v1.0 tasks
 * carry no createdAt/lastModified, so timestamps here come from the injected
 * clock. Everything resets on restart by design.
 */
export function createRegistry({
  clock = () => new Date(),
  idFactory = randomUUID,
} = {}) {
  const tasks = new Map()
  const artifacts = new Map() // `${taskId}/${artifactName}` → { ref, data }

  return {
    newContextId() {
      return `ctx-${String(idFactory()).slice(0, 8)}`
    },

    record({ taskId, agent, agentUrl, contextId, state }) {
      tasks.set(taskId, {
        taskId,
        agent,
        agentUrl,
        contextId,
        state,
        artifactName: undefined,
        updatedAt: clock().toISOString(),
      })
    },

    update(taskId, state, { artifactName } = {}) {
      const entry = tasks.get(taskId)
      if (!entry) return
      entry.state = state
      if (artifactName) entry.artifactName = artifactName
      entry.updatedAt = clock().toISOString()
    },

    get(taskId) {
      return tasks.get(taskId)
    },

    /** Resolves a task by unambiguous id prefix (CLI /cancel tx-1234…). */
    byPrefix(prefix) {
      const matches = [...tasks.values()].filter((entry) =>
        entry.taskId.startsWith(prefix),
      )
      return matches.length === 1 ? matches[0] : undefined
    },

    byContext(contextId) {
      return [...tasks.values()].filter(
        (entry) => entry.contextId === contextId,
      )
    },

    all() {
      return [...tasks.values()]
    },

    contexts() {
      return [...new Set([...tasks.values()].map((entry) => entry.contextId))]
    },

    saveArtifact(ref, data) {
      artifacts.set(`${ref.taskId}/${ref.artifactId}`, { ref, data })
      this.update(ref.taskId, tasks.get(ref.taskId)?.state, {
        artifactName: ref.artifactId,
      })
    },

    getArtifact(ref) {
      return artifacts.get(`${ref.taskId}/${ref.artifactId}`)?.data
    },

    describe(taskId) {
      const entry = tasks.get(taskId)
      if (!entry) return undefined
      return `${entry.taskId.slice(0, 8)}  ${entry.agent}  ${shortStateLabel(entry.state)}`
    },
  }
}
