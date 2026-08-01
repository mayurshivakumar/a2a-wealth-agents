import { randomUUID } from 'node:crypto'
import { TaskState } from '@a2a-js/sdk'
import {
  artifactData,
  createUserMessage,
  extractText,
  findArtifact,
  isTerminal,
  listTasksParams,
} from '@wealth/a2a-common'
import {
  Allocation,
  ArtifactRef,
  ExecutionPlan,
  Portfolio,
} from '@wealth/schemas'

// The three protocol flows behind the Orchestrator's tools. Identical in
// scripted and LLM modes — only routing/extraction differ above this layer.
// Every extracted artifact is re-validated client-side (boundary rule), and
// tool results are artifact REFS + cached data, never loose payloads.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeRef({ agent, task, artifactId, schema }) {
  return ArtifactRef.parse({
    agent,
    taskId: task.id,
    contextId: task.contextId,
    artifactId,
    schema,
  })
}

export function createActions({
  agents,
  registry,
  config,
  idFactory = randomUUID,
  onArtifact,
  logger,
}) {
  function requireAgent(name) {
    const agent = agents[name]
    if (!agent || agent.status !== 'online') {
      throw new Error(
        `the ${name} agent is offline${agent?.reason ? ` (${agent.reason})` : ''} — cannot route`,
      )
    }
    return agent
  }

  function track(agentName, task) {
    registry.record({
      taskId: task.id,
      agent: agentName,
      agentUrl: agents[agentName]?.url,
      contextId: task.contextId,
      state: task.status.state,
    })
  }

  async function collectArtifact({ agent, task, name, schema, schemaName }) {
    const artifact = findArtifact(task, name)
    if (!artifact)
      throw new Error(
        `task ${task.id} completed without the "${name}" artifact`,
      )
    const data = schema.parse(artifactData(artifact)) // client-side boundary re-validation
    const ref = makeRef({ agent, task, artifactId: name, schema: schemaName })
    registry.saveArtifact(ref, data)
    await onArtifact?.({ agent, name, data, ref })
    return { ref, data, artifact }
  }

  return {
    /** Flow A — blocking SendMessage to Portfolio. */
    async standardizePortfolio({ contextId, rawText }) {
      const agent = requireAgent('portfolio')
      const task = await agent.client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: false,
        },
        message: createUserMessage({ text: rawText, contextId, idFactory }),
      })
      track('portfolio', task)
      const { ref, data, artifact } = await collectArtifact({
        agent: 'portfolio',
        task,
        name: 'standardized-holdings',
        schema: Portfolio,
        schemaName: 'portfolio-v1',
      })
      return {
        task,
        ref,
        portfolio: data,
        warnings: artifact.metadata?.warnings ?? [],
      }
    },

    /** Flow B — streaming send to Strategy, with reconnect + GetTask fallback. */
    async deriveAllocation({ contextId, request, rawText, onStatus }) {
      const agent = requireAgent('strategy')
      const message = createUserMessage({
        ...(request !== undefined
          ? { data: request, schemaName: 'strategy-request-v1' }
          : { text: rawText }),
        contextId,
        idFactory,
      })

      let taskId
      const consume = async (iterable) => {
        for await (const event of iterable) {
          const { $case, value } = event.payload
          if ($case === 'task') {
            taskId = value.id
            track('strategy', value)
          } else if ($case === 'statusUpdate') {
            registry.update(value.taskId, value.status.state)
            onStatus?.(value)
          }
        }
      }

      try {
        await consume(
          agent.client.sendMessageStream({
            tenant: '',
            configuration: {
              acceptedOutputModes: ['application/json'],
              returnImmediately: true,
            },
            message,
          }),
        )
      } catch (error) {
        if (!taskId) throw error // dropped before the snapshot: nothing to reattach to
        logger?.warn('strategy stream dropped; reattaching', {
          taskId,
          err: error,
        })
        let delay = config.sseReconnect.baseMs
        for (
          let attempt = 1;
          attempt <= config.sseReconnect.attempts;
          attempt += 1
        ) {
          try {
            await consume(
              agent.client.resubscribeTask({ tenant: '', id: taskId }),
            )
            break
          } catch (retryError) {
            // Terminal while we were away → GetTask below is the fallback.
            if (retryError.envelopeCode === -32004) break
            if (attempt === config.sseReconnect.attempts) throw retryError
            await sleep(delay)
            delay *= 2
          }
        }
      }

      const task = await agent.client.getTask({ tenant: '', id: taskId })
      registry.update(task.id, task.status.state)
      if (task.status.state !== TaskState.TASK_STATE_COMPLETED) {
        throw new Error(
          `strategy task ${task.id} ended in ${task.status.state}: ${extractText(task.status.message) || 'no detail'}`,
        )
      }
      const { ref, data } = await collectArtifact({
        agent: 'strategy',
        task,
        name: 'target-allocation',
        schema: Allocation,
        schemaName: 'allocation-v1',
      })
      return { task, ref, allocation: data }
    },

    /** Flow C — non-blocking send to Tax; returns the SUBMITTED snapshot. */
    async startTaxTask({ contextId, portfolio, allocation }) {
      const agent = requireAgent('tax')
      const task = await agent.client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: true,
        },
        message: createUserMessage({
          data: { portfolio, allocation },
          schemaName: 'tax-request-v1',
          contextId,
          idFactory,
        }),
      })
      track('tax', task)
      return task
    },

    /**
     * Polls GetTask until the task is terminal or pauses INPUT_REQUIRED.
     * onTransition fires once per observed state change.
     */
    async pollTaxTask({ taskId, onTransition }) {
      const agent = requireAgent('tax')
      let lastState
      for (;;) {
        const task = await agent.client.getTask({ tenant: '', id: taskId })
        if (task.status.state !== lastState) {
          lastState = task.status.state
          registry.update(taskId, task.status.state)
          onTransition?.(task)
        }
        if (isTerminal(task.status.state)) return this.finishTaxTask(task)
        if (task.status.state === TaskState.TASK_STATE_INPUT_REQUIRED) {
          return {
            state: 'input-required',
            task,
            question: extractText(task.status.message),
          }
        }
        await sleep(config.getTaskPollMs)
      }
    },

    /** Continues an input-required Tax task on the SAME taskId. */
    async answerTaxQuestion({ taskId, contextId, lotId, purchaseDate }) {
      const agent = requireAgent('tax')
      const task = await agent.client.sendMessage({
        tenant: '',
        configuration: {
          acceptedOutputModes: ['application/json'],
          returnImmediately: false,
        },
        message: createUserMessage({
          data: { lotId, purchaseDate },
          schemaName: 'tax-followup-v1',
          taskId,
          contextId,
          idFactory,
        }),
      })
      registry.update(task.id, task.status.state)
      if (task.status.state === TaskState.TASK_STATE_INPUT_REQUIRED) {
        return {
          state: 'input-required',
          task,
          question: extractText(task.status.message),
        }
      }
      if (isTerminal(task.status.state)) return this.finishTaxTask(task)
      return this.pollTaxTask({ taskId })
    },

    /** Classifies a terminal Tax task and extracts the plan when completed. */
    async finishTaxTask(task) {
      if (task.status.state === TaskState.TASK_STATE_COMPLETED) {
        const { ref, data } = await collectArtifact({
          agent: 'tax',
          task,
          name: 'execution-plan',
          schema: ExecutionPlan,
          schemaName: 'execution-plan-v1',
        })
        return { state: 'completed', task, ref, plan: data }
      }
      if (task.status.state === TaskState.TASK_STATE_CANCELED) {
        return { state: 'canceled', task }
      }
      return { state: 'failed', task, reason: extractText(task.status.message) }
    },

    /** CLI /cancel — resolves the agent from the registry entry. */
    async cancelTask({ taskId }) {
      const entry = registry.get(taskId)
      if (!entry) throw new Error(`unknown task ${taskId}`)
      const agent = requireAgent(entry.agent)
      const task = await agent.client.cancelTask({ tenant: '', id: taskId })
      registry.update(taskId, task.status.state)
      return task
    },

    /** Reconciliation: every online agent's ListTasks, keyed by agent name. */
    async listRemoteTasks() {
      const result = {}
      for (const agent of Object.values(agents)) {
        if (agent.status !== 'online') continue
        const response = await agent.client.listTasks(listTasksParams())
        result[agent.name] = response.tasks ?? []
      }
      return result
    },
  }
}
