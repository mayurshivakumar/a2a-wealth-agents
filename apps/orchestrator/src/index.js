// telemetry.js MUST stay the first import: it loads .env, registers OTel
// instrumentation before anything else touches http/undici, and (when
// configured) attaches the Langfuse span processor — orchestrator-only.
import { tracing } from './telemetry.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createLogger,
  createRemoteClientFactory,
  loadConfig,
} from '@wealth/a2a-common'
import { createActions } from './a2a-actions.js'
import { createCli } from './cli.js'
import { discoverAgents } from './discovery.js'
import { createRegistry } from './registry.js'

function parseArgs(argv) {
  const args = { scripted: false, artifactDir: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--scripted') args.scripted = true
    if (argv[index] === '--artifact-dir') args.artifactDir = argv[index + 1]
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const config = loadConfig()
const logger = createLogger({
  level: process.env.LOG_LEVEL ? config.logLevel : 'warn', // keep the CLI quiet unless asked
  pretty: config.logPretty,
})

const factory = createRemoteClientFactory({
  timeoutMs: config.requestTimeoutMs,
})
const agents = await discoverAgents({ urls: config.urls, factory, logger })
const registry = createRegistry()

const onArtifact = args.artifactDir
  ? async ({ agent, name, data }) => {
      await mkdir(args.artifactDir, { recursive: true })
      await writeFile(
        path.join(args.artifactDir, `${agent}-${name}.json`),
        `${JSON.stringify(data, null, 2)}\n`,
      )
    }
  : undefined

const actions = createActions({ agents, registry, config, onArtifact, logger })

let scripted = args.scripted
if (!scripted && !config.openaiApiKey) {
  console.log('No OPENAI_API_KEY set — falling back to --scripted mode.')
  scripted = true
}

if (scripted) {
  const cli = createCli({
    agents,
    registry,
    actions,
    config,
    artifactDir: args.artifactDir,
    logger,
    onExit: async () => {
      await tracing.shutdown() // flush buffered spans before the process dies
      process.exit(process.exitCode ?? 0)
    },
  })
  await cli.start()
} else {
  // The LLM routing layer (@openai/agents) — only ever imported on this path
  // so scripted mode stays keyless and OpenAI-free by construction.
  const { runLlmCli } = await import('./llm.js')
  await runLlmCli({
    agents,
    registry,
    actions,
    config,
    artifactDir: args.artifactDir,
    logger,
  })
  await tracing.shutdown()
}
