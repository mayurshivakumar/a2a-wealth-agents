// telemetry.js MUST stay the first import: it registers OTel instrumentation
// (and loads .env) before Hapi enters the module graph.
import { tracing } from './telemetry.js'
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
installShutdownHandlers({
  stop: () => app.stop({ timeout: 5_000 }),
  onShutdown: () => tracing.shutdown(),
  logger,
})
