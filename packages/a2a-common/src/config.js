import { z } from 'zod'

const portSchema = z.coerce.number().int().min(1).max(65535)
const durationSchema = z.coerce.number().int().min(0).max(300_000)
// `.env` commonly leaves unset optional secrets as a blank assignment (`KEY=`),
// which dotenv loads as `''`, not `undefined`. Treat blank the same as absent.
const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
)

const environmentSchema = z.object({
  // Optional on purpose: --scripted mode, tests, and demos must run keyless.
  // The orchestrator's LLM path checks for the key itself when it is needed.
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-5.4-mini'),
  A2A_HOST: z.string().trim().min(1).default('localhost'),
  ORCHESTRATOR_PORT: portSchema.default(3000),
  PORTFOLIO_PORT: portSchema.default(4001),
  STRATEGY_PORT: portSchema.default(4002),
  TAX_PORT: portSchema.default(4003),
  PORTFOLIO_AGENT_URL: z.url().optional(),
  STRATEGY_AGENT_URL: z.url().optional(),
  TAX_AGENT_URL: z.url().optional(),
  A2A_REQUEST_TIMEOUT_MS: durationSchema.default(30_000),
  GETTASK_POLL_MS: z.coerce.number().int().min(1).max(60_000).default(2_000),
  INPUT_REQUIRED_REMINDER_MS: durationSchema.default(60_000),
  SSE_RECONNECT_ATTEMPTS: z.coerce.number().int().min(0).max(10).default(3),
  SSE_RECONNECT_BASE_MS: durationSchema.default(1_000),
  TAX_SIMULATED_DELAY_MS: durationSchema.default(1_500),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  NODE_ENV: z.string().trim().optional(),
  LANGFUSE_PUBLIC_KEY: optionalTrimmedString,
  LANGFUSE_SECRET_KEY: optionalTrimmedString,
  LANGFUSE_BASE_URL: z.url().default('https://us.cloud.langfuse.com'),
  LANGFUSE_TRACING: z.enum(['true', 'false']).optional(),
})

function withoutTrailingSlash(url) {
  return url.replace(/\/+$/, '')
}

function formatIssues(error) {
  return error.issues
    .map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
    )
    .join('; ')
}

export function loadConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment)

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${formatIssues(result.error)}`,
    )
  }

  const values = result.data
  const hasLangfuseKeys = Boolean(
    values.LANGFUSE_PUBLIC_KEY && values.LANGFUSE_SECRET_KEY,
  )
  const langfuseEnabled =
    values.LANGFUSE_TRACING === undefined
      ? hasLangfuseKeys
      : values.LANGFUSE_TRACING === 'true'

  return {
    openaiApiKey: values.OPENAI_API_KEY,
    model: values.OPENAI_MODEL,
    host: values.A2A_HOST,
    ports: {
      orchestrator: values.ORCHESTRATOR_PORT,
      portfolio: values.PORTFOLIO_PORT,
      strategy: values.STRATEGY_PORT,
      tax: values.TAX_PORT,
    },
    urls: {
      portfolio: withoutTrailingSlash(
        values.PORTFOLIO_AGENT_URL ??
          `http://localhost:${values.PORTFOLIO_PORT}`,
      ),
      strategy: withoutTrailingSlash(
        values.STRATEGY_AGENT_URL ?? `http://localhost:${values.STRATEGY_PORT}`,
      ),
      tax: withoutTrailingSlash(
        values.TAX_AGENT_URL ?? `http://localhost:${values.TAX_PORT}`,
      ),
    },
    requestTimeoutMs: values.A2A_REQUEST_TIMEOUT_MS,
    getTaskPollMs: values.GETTASK_POLL_MS,
    inputRequiredReminderMs: values.INPUT_REQUIRED_REMINDER_MS,
    sseReconnect: {
      attempts: values.SSE_RECONNECT_ATTEMPTS,
      baseMs: values.SSE_RECONNECT_BASE_MS,
    },
    taxSimulatedDelayMs: values.TAX_SIMULATED_DELAY_MS,
    logLevel: values.LOG_LEVEL,
    logPretty: values.LOG_FORMAT
      ? values.LOG_FORMAT === 'pretty'
      : values.NODE_ENV === 'development',
    langfuse: {
      enabled: langfuseEnabled,
      publicKey: values.LANGFUSE_PUBLIC_KEY,
      secretKey: values.LANGFUSE_SECRET_KEY,
      baseUrl: values.LANGFUSE_BASE_URL,
    },
  }
}
