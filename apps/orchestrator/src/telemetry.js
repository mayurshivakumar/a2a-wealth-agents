// FIRST import of the process (see src/index.js): instrumentation must
// register before anything pulls in node:http/undici-heavy modules. Langfuse
// is orchestrator-only and loaded dynamically, so keyless/scripted runs never
// touch @langfuse/* at all.
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { loadConfig } from '@wealth/a2a-common/config'
import { initTracing } from '@wealth/a2a-common/tracing'

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

const config = loadConfig()
const spanProcessors = []

if (config.langfuse.enabled) {
  const { LangfuseSpanProcessor } = await import('@langfuse/otel')
  spanProcessors.push(
    new LangfuseSpanProcessor({
      publicKey: config.langfuse.publicKey,
      secretKey: config.langfuse.secretKey,
      baseUrl: config.langfuse.baseUrl,
    }),
  )
}

export const tracing = initTracing({
  serviceName: 'wealth-orchestrator',
  spanProcessors,
})
