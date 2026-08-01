import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  createA2AServer,
  createLogger,
  installShutdownHandlers,
  loadConfig,
} from '@wealth/a2a-common'
import { taxCardFor } from './card.js'
import { createTaxExecutor, createTaxRequestValidator } from './executor.js'

loadEnv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
})

const config = loadConfig()
const logger = createLogger({
  level: config.logLevel,
  pretty: config.logPretty,
})

const app = createA2AServer({
  host: config.host,
  port: config.ports.tax,
  cardFor: taxCardFor,
  executor: createTaxExecutor({
    simulatedDelayMs: config.taxSimulatedDelayMs,
    logger: logger.child({ component: 'executor' }),
  }),
  validateRequest: createTaxRequestValidator(),
  logger,
})

await app.start()
installShutdownHandlers({ stop: () => app.stop({ timeout: 5_000 }), logger })
