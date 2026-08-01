import winston from 'winston'

const { combine, timestamp, json, colorize, printf } = winston.format

// Replaces any Error-valued field (e.g. `err`) with a plain, serializable
// object so both JSON and pretty output carry the name/message/stack instead
// of an empty `{}` or an unstructured string.
//
// Deliberately does not include winston's splat() in the pipeline: splat()
// re-derives `info` from the original log call's raw arguments, which
// silently undoes this transform if placed anywhere in the chain relative to
// it. This project never uses printf-style (`%s`) log calls, so splat() has
// no purpose here and is omitted rather than fought with.
const normalizeErrors = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    if (value instanceof Error) {
      info[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }
  }
  return info
})

const prettyPrinter = printf(({ level, message, timestamp: ts, ...meta }) => {
  delete meta[Symbol.for('level')]
  delete meta[Symbol.for('message')]
  const rest = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  return `${ts} ${level}: ${message}${rest}`
})

/**
 * Builds a process logger. JSON output is the default (suitable for log
 * aggregation); `pretty: true` produces colorized, human-readable lines for
 * local development. Tag task-scoped lines via `logger.child({ taskId,
 * contextId })` so cross-process correlation works.
 */
export function createLogger({
  level = 'info',
  pretty = false,
  silent = false,
  transports = [new winston.transports.Console()],
} = {}) {
  const format = pretty
    ? combine(
        timestamp({ format: 'HH:mm:ss.SSS' }),
        normalizeErrors(),
        prettyPrinter,
        colorize({ all: true }),
      )
    : combine(timestamp(), normalizeErrors(), json())

  return winston.createLogger({
    level,
    format,
    transports,
    silent,
  })
}

// Safe default for library modules: exposes the full info/debug/warn/error
// (and child()) surface but emits nothing. Real output is only produced by
// the logger each app builds from validated config in its src/index.js.
export const noopLogger = createLogger({ silent: true })
