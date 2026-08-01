// telemetry.js MUST stay the first import: it registers OTel instrumentation
// (and loads .env) before Hapi enters the module graph.
import { tracing } from './telemetry.js'
import {
  createA2AServer,
  createLogger,
  installShutdownHandlers,
  loadConfig,
} from '@wealth/a2a-common'
import { portfolioCardFor } from './card.js'
import {
  createPortfolioExecutor,
  createPortfolioRequestValidator,
} from './executor.js'

const config = loadConfig()
const logger = createLogger({
  level: config.logLevel,
  pretty: config.logPretty,
})

const app = createA2AServer({
  host: config.host,
  port: config.ports.portfolio,
  cardFor: portfolioCardFor,
  executor: createPortfolioExecutor({
    logger: logger.child({ component: 'executor' }),
  }),
  validateRequest: createPortfolioRequestValidator(),
  logger,
})

await app.start()
installShutdownHandlers({
  stop: () => app.stop({ timeout: 5_000 }),
  onShutdown: () => tracing.shutdown(),
  logger,
})
