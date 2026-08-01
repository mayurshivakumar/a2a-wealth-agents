import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForHealthz } from '@wealth/a2a-common'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const AGENTS = {
  portfolio: {
    dir: 'apps/portfolio-agent',
    offset: 1,
    portVar: 'PORTFOLIO_PORT',
    urlVar: 'PORTFOLIO_AGENT_URL',
  },
  strategy: {
    dir: 'apps/strategy-agent',
    offset: 2,
    portVar: 'STRATEGY_PORT',
    urlVar: 'STRATEGY_AGENT_URL',
  },
  tax: {
    dir: 'apps/tax-agent',
    offset: 3,
    portVar: 'TAX_PORT',
    urlVar: 'TAX_AGENT_URL',
  },
}

/**
 * Copy of the environment with every secret the demos must not depend on
 * removed. Slice 0's exit criterion is "demos pass with no API keys" —
 * scrubbing makes that enforced rather than assumed.
 */
export function scrubbedEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.OPENAI_API_KEY
  for (const key of Object.keys(env)) {
    if (key.startsWith('LANGFUSE_')) delete env[key]
  }
  return env
}

/**
 * Spawns the named agents as real child processes on `portBase`-offset ports
 * (so demos never collide with a dev mesh on 4001–4003, and each demo uses
 * its own base), waits for every /healthz, and returns {urls, env, teardown}.
 */
export async function spawnAgents(names, { portBase, env = {} } = {}) {
  if (!portBase)
    throw new Error('spawnAgents needs an explicit portBase (e.g. 14020)')

  const urls = {}
  const portEnv = {}
  for (const [name, spec] of Object.entries(AGENTS)) {
    const port = portBase + spec.offset
    portEnv[spec.portVar] = String(port)
    portEnv[spec.urlVar] = `http://localhost:${port}`
    urls[name] = `http://localhost:${port}`
  }
  const childEnv = scrubbedEnv({ ...portEnv, LOG_LEVEL: 'warn', ...env })

  let tearingDown = false
  const children = names.map((name) => {
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: path.join(repoRoot, AGENTS[name].dir),
      env: childEnv,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.on('exit', (code) => {
      if (code && !tearingDown) {
        console.error(
          `[harness] ${name} agent exited unexpectedly with code ${code}`,
        )
      }
    })
    return child
  })

  const teardown = async () => {
    tearingDown = true
    await Promise.all(
      children.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null) return resolve()
            child.once('exit', resolve)
            child.kill('SIGTERM')
          }),
      ),
    )
  }

  try {
    await Promise.all(
      names.map((name) =>
        waitForHealthz(urls[name], { attempts: 100, delayMs: 100 }),
      ),
    )
  } catch (error) {
    await teardown()
    throw error
  }

  return { urls, env: childEnv, teardown }
}

/**
 * Wraps a demo body: prints a pass/fail line, sets the exit code on failure,
 * and never masks the error. Demos assert on artifact CONTENTS via
 * lib/asserts.js, not console text.
 */
export async function runDemo(name, fn) {
  try {
    await fn()
    console.log(`\n✔ ${name} passed`)
  } catch (error) {
    console.error(`\n✘ ${name} failed`)
    console.error(error)
    process.exitCode = 1
  }
}

export function step(text) {
  console.log(`  ✔ ${text}`)
}
