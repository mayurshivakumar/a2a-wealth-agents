import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  createA2AServer,
  createLogger,
  installShutdownHandlers,
  loadConfig,
} from '@wealth/a2a-common'
import { strategyCardFor } from './card.js'
import {
  createStrategyExecutor,
  createStrategyRequestValidator,
} from './executor.js'

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
  port: config.ports.strategy,
  cardFor: strategyCardFor,
  executor: createStrategyExecutor({
    logger: logger.child({ component: 'executor' }),
  }),
  validateRequest: createStrategyRequestValidator(),
  logger,
})

await app.start()
installShutdownHandlers({ stop: () => app.stop({ timeout: 5_000 }), logger })
