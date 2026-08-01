import readline from 'node:readline'
import { Agent, MemorySession, run } from '@openai/agents'
import { createOrchestratorTools } from './tools.js'
import {
  renderAgents,
  renderBanner,
  renderTaskTree,
  shortId,
} from './render.js'

// The LLM routing layer ("LLM plans, protocol transports"): gpt-5.4-mini
// decides tool sequencing and extracts typed arguments from free text; every
// tool body is the same deterministic a2a-actions layer scripted mode uses.
// This module is only ever loaded when an OPENAI_API_KEY is present — the
// scripted path never imports @openai/agents.

const INSTRUCTIONS = `
You are the Wealth Orchestrator, the coordinator of an A2A agent mesh
(Portfolio, Strategy, Tax). You never compute financial results yourself —
every number comes from a remote agent via your tools.

Rules:
- When the user pastes holdings, call standardize_portfolio with the paste verbatim.
- When the user states an investment philosophy, map it to the closed enum
  (bogleheads-three-fund | esg-tilt | dividend-growth | all-weather | custom)
  and call derive_allocation; extract any constraints (expense ratio caps,
  excluded sectors, domiciles) into the constraints argument. For custom,
  extract weights that sum to 100.
- Only after both artifacts exist, and the user confirms, call optimize_taxes.
- If optimize_taxes pauses with a question, relay it verbatim, wait for the
  user's answer, convert the date to ISO (YYYY-MM-DD), and call
  answer_tax_question with the lot the question named.
- Tables are already printed to the terminal by the tools — do not repeat
  their contents. Answer with one or two short sentences (state, refs, next step).
- If a tool reports an agent offline or a rejection, tell the user what was
  wrong and what to try next; never invent data to work around it.
`.trim()

export async function runLlmCli({
  agents,
  registry,
  actions,
  config,
  input = process.stdin,
  output = process.stdout,
  logger,
}) {
  const print = (text = '') => output.write(`${text}\n`)
  const contextId = registry.newContextId()
  const { tools } = createOrchestratorTools({ actions, contextId, print })

  const agent = new Agent({
    name: 'Wealth Orchestrator',
    model: config.model,
    instructions: INSTRUCTIONS,
    tools,
  })
  const session = new MemorySession({ sessionId: contextId })

  print(renderBanner(agents))
  print(`\n(LLM mode: ${config.model} · context ${contextId})`)
  print(
    'Paste your holdings to begin. Commands: /tasks /agents /cancel <id> /quit',
  )

  const rl = readline.createInterface({ input, terminal: false })
  const lines = []
  let waiter = null
  let closed = false
  rl.on('line', (line) => {
    lines.push(line.trim())
    waiter?.()
  })
  rl.on('close', () => {
    closed = true
    waiter?.()
  })

  const nextLine = () =>
    new Promise((resolve) => {
      const pump = () => {
        if (lines.length > 0) return resolve(lines.shift())
        if (closed) return resolve(null)
        waiter = () => {
          waiter = null
          pump()
        }
      }
      pump()
    })

  for (;;) {
    const line = await nextLine()
    if (line === null || line === '/quit' || line === '/exit') break
    if (!line) continue

    if (line.startsWith('/')) {
      const [command, ...args] = line.split(/\s+/)
      try {
        if (command === '/agents') print(renderAgents(agents))
        else if (command === '/tasks') {
          print(renderTaskTree(registry, await actions.listRemoteTasks()))
        } else if (command === '/cancel') {
          const target = registry.byPrefix(args[0] ?? '')
          if (!target) print(`✘ no unique task matches "${args[0] ?? ''}"`)
          else {
            const task = await actions.cancelTask({ taskId: target.taskId })
            print(`✔ Task ${shortId(task.id)} canceled.`)
          }
        } else print('Commands: /tasks /agents /cancel <id> /quit')
      } catch (error) {
        print(`✘ ${error.message}`)
      }
      continue
    }

    try {
      const result = await run(agent, line, { session })
      print(result.finalOutput ?? '')
    } catch (error) {
      logger?.error('llm turn failed', { err: error })
      print(`✘ LLM turn failed: ${error.message}`)
    }
  }

  rl.close()
}
