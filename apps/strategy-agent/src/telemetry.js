// FIRST import of the process (see src/index.js): OpenTelemetry's http
// instrumentation must register before @hapi/hapi pulls in node:http, so this
// module's graph deliberately avoids the rest of @wealth/a2a-common.
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { initTracing } from '@wealth/a2a-common/tracing'

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

export const tracing = initTracing({ serviceName: 'wealth-strategy-agent' })
