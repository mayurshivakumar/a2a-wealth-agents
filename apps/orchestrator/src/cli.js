import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { extractText, isTerminal, shortStateLabel } from '@wealth/a2a-common'
import {
  isAffirmative,
  isNegative,
  matchPhilosophy,
  parsePlainDate,
  philosophyMenu,
} from './scripted.js'
import {
  renderAgents,
  renderAllocation,
  renderBanner,
  renderPlan,
  renderPortfolio,
  renderTaskTree,
  shortId,
} from './render.js'

/**
 * The scripted CLI: one readline owner + an explicit state machine.
 *
 * `/commands` run immediately in ANY state (including while a Tax task is
 * polling); conversational lines are queued and consumed by the pipeline via
 * nextLine(), so piped stdin (demo 07) and interactive TTYs behave the same.
 * The input-required reminder uses global timers — injectable via vitest
 * fake timers in tests.
 */
export function createCli({
  agents,
  registry,
  actions,
  config,
  input = process.stdin,
  output = process.stdout,
  artifactDir,
  logger,
  onExit,
}) {
  const rl = readline.createInterface({ input, terminal: false })
  const print = (text = '') => output.write(`${text}\n`)

  const queue = []
  let waiter = null
  let closed = false
  let activeTax = null // { taskId, contextId } while a Tax task is live
  let reminderTimer = null

  function nextLine() {
    return new Promise((resolve) => {
      const pump = () => {
        if (queue.length > 0) return resolve(queue.shift())
        if (closed) return resolve(null)
        waiter = () => {
          waiter = null
          pump()
        }
      }
      pump()
    })
  }

  function clearReminder() {
    if (reminderTimer) {
      clearTimeout(reminderTimer)
      reminderTimer = null
    }
  }

  function armReminder(taskId, question) {
    clearReminder()
    reminderTimer = setTimeout(() => {
      print(
        `⏸ ${shortId(taskId)} still waiting: ${question} Reply, or /cancel ${shortId(taskId)}.`,
      )
    }, config.inputRequiredReminderMs)
    reminderTimer.unref?.()
  }

  // The run manifest is derived purely from the registry so it stays correct
  // however many conversations ran before exit.
  async function writeManifest() {
    if (!artifactDir) return
    const manifest = {
      contexts: registry.contexts(),
      tasks: registry.all().map((entry) => ({
        agent: entry.agent,
        taskId: entry.taskId,
        contextId: entry.contextId,
        state: shortStateLabel(entry.state),
      })),
    }
    await mkdir(artifactDir, { recursive: true })
    await writeFile(
      path.join(artifactDir, 'run.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
  }

  async function handleCommand(line) {
    const [command, ...args] = line.split(/\s+/)
    try {
      switch (command) {
        case '/help':
          print('Commands: /tasks  /agents  /cancel <taskId>  /quit')
          break
        case '/agents':
          print(renderAgents(agents))
          break
        case '/tasks': {
          let remote
          try {
            remote = await actions.listRemoteTasks()
          } catch (error) {
            print(`⚠ could not reconcile with agents: ${error.message}`)
          }
          print(renderTaskTree(registry, remote))
          break
        }
        case '/cancel': {
          const target = registry.byPrefix(args[0] ?? '')
          if (!target) {
            print(`✘ no unique task matches "${args[0] ?? ''}" — see /tasks`)
            break
          }
          const task = await actions.cancelTask({ taskId: target.taskId })
          clearReminder()
          print(`✔ Task ${shortId(task.id)} canceled.`)
          break
        }
        case '/quit':
        case '/exit':
          await shutdown()
          break
        default:
          print(`Unknown command ${command} — try /help`)
      }
    } catch (error) {
      print(`✘ ${error.message}`)
    }
  }

  async function shutdown() {
    if (closed) return
    closed = true
    clearReminder()
    await writeManifest()
    rl.close()
    await onExit?.()
  }

  rl.on('line', (raw) => {
    const line = raw.trim()
    if (!line) return
    if (line.startsWith('/')) {
      void handleCommand(line)
      return
    }
    queue.push(line)
    waiter?.()
  })
  rl.on('close', () => {
    closed = true
    waiter?.()
  })

  async function runTaxFlow({ contextId, portfolio, allocation }) {
    const submitted = await actions.startTaxTask({
      contextId,
      portfolio,
      allocation,
    })
    activeTax = { taskId: submitted.id, contextId }
    print(
      `⟳ Tax Agent (task ${shortId(submitted.id)} · ${shortStateLabel(submitted.status.state)}) — greedy harvester started, polling…`,
    )

    let outcome = await actions.pollTaxTask({
      taskId: submitted.id,
      onTransition: (task) => {
        if (
          task.status.state !== submitted.status.state &&
          !isTerminal(task.status.state)
        ) {
          print(`⟳ ${shortId(task.id)} ${shortStateLabel(task.status.state)}`)
        }
      },
    })

    while (outcome.state === 'input-required') {
      print(
        `❓ Tax Agent needs input (${shortId(submitted.id)} · input-required):`,
      )
      print(`   "${outcome.question}"`)
      armReminder(submitted.id, outcome.question)

      const answer = await nextLine()
      if (answer === null) return null // stdin ended mid-question
      clearReminder()

      const purchaseDate = parsePlainDate(answer)
      if (!purchaseDate) {
        print(
          '   Could not parse a date — reply like "2024-03-15" or "March 15, 2024".',
        )
        armReminder(submitted.id, outcome.question)
        continue
      }
      const lotId = outcome.question.match(/lot ([A-Z0-9.-]+)/)?.[1]
      print(`⟳ ${shortId(submitted.id)} resuming with purchase date…`)
      outcome = await actions.answerTaxQuestion({
        taskId: submitted.id,
        contextId,
        lotId,
        purchaseDate,
      })
    }

    activeTax = null
    clearReminder()
    return outcome
  }

  async function conversation() {
    const contextId = registry.newContextId()

    // 1. Holdings → Portfolio (Flow A)
    let portfolioResult
    while (!portfolioResult) {
      const paste = await nextLine()
      if (paste === null) return false
      print('⟳ Standardizing holdings… (Portfolio Agent)')
      try {
        portfolioResult = await actions.standardizePortfolio({
          contextId,
          rawText: paste,
        })
      } catch (error) {
        print(
          `✘ Portfolio Agent rejected the input (${error.name ?? 'error'}): ${error.message}`,
        )
        print('  Tip: paste account, symbol, quantity, and cost per share.')
      }
    }
    print(
      `✔ Portfolio standardized (${shortId(portfolioResult.task.id)} · completed)\n`,
    )
    print(renderPortfolio(portfolioResult.portfolio, portfolioResult.warnings))
    print('\nWhat investment philosophy should I apply?')
    print(philosophyMenu)

    // 2. Philosophy → Strategy (Flow B)
    let allocationResult
    while (!allocationResult) {
      const answer = await nextLine()
      if (answer === null) return false
      const philosophy = matchPhilosophy(answer)
      try {
        allocationResult = await actions.deriveAllocation({
          contextId,
          // Unmatched text goes to Strategy verbatim as a TEXT part (D4):
          // the deterministic server rejects it with -32602.
          ...(philosophy ? { request: { philosophy } } : { rawText: answer }),
          onStatus: (update) => {
            const text = update.status.message
              ? extractText(update.status.message)
              : ''
            const note = text ? ` — ${text}` : ''
            print(
              `⟳ Strategy (task ${shortId(update.taskId)}) ${shortStateLabel(update.status.state)}${note}`,
            )
          },
        })
      } catch (error) {
        print(`✘ Strategy rejected the philosophy: ${error.message}`)
        print(philosophyMenu)
      }
    }
    print(
      `✔ Allocation ready (${shortId(allocationResult.task.id)} · completed)\n`,
    )
    print(renderAllocation(allocationResult.allocation))

    // 3. Confirm → Tax (Flow C)
    print('\nGenerate the tax-optimized execution plan? (y/n)')
    for (;;) {
      const answer = await nextLine()
      if (answer === null) return false
      if (isNegative(answer)) {
        print('Skipped. (/tasks to inspect the run, /quit to exit)')
        return true
      }
      if (isAffirmative(answer)) break
      print('Please answer y or n.')
    }

    const outcome = await runTaxFlow({
      contextId,
      portfolio: portfolioResult.portfolio,
      allocation: allocationResult.allocation,
    })
    if (outcome === null) return false

    if (outcome.state === 'completed') {
      print(
        `✔ Execution plan ready (${shortId(outcome.task.id)} · completed)\n`,
      )
      print(renderPlan(outcome.plan))
    } else if (outcome.state === 'canceled') {
      print(`✔ Task ${shortId(outcome.task.id)} canceled.`)
    } else {
      print(`✘ Tax task failed: ${outcome.reason}`)
    }
    await writeManifest()
    print('\nAnything else? Paste new holdings, or /tasks · /quit')
    return true
  }

  return {
    async start() {
      print(renderBanner(agents))
      print('\nPaste your holdings to begin.')
      try {
        for (;;) {
          const keepGoing = await conversation()
          if (!keepGoing || closed) break
        }
      } catch (error) {
        logger?.error('cli loop crashed', { err: error })
        print(`✘ fatal: ${error.message}`)
        throw error
      } finally {
        await shutdown()
      }
    },
    stop: shutdown,
    // Test seams
    _handleCommand: handleCommand,
    get _activeTax() {
      return activeTax
    },
  }
}
