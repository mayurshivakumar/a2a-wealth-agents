import { noopLogger } from './logger.js'

export function installShutdownHandlers({
  stop,
  logger = noopLogger,
  processObject = process,
  onShutdown,
}) {
  let shuttingDown = false

  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`Received ${signal}; stopping.`)

    try {
      await stop()
      await onShutdown?.()
    } catch (error) {
      logger.error('Failed to stop cleanly.', { err: error })
      processObject.exitCode = 1
    }
  }

  processObject.once('SIGINT', () => shutdown('SIGINT'))
  processObject.once('SIGTERM', () => shutdown('SIGTERM'))

  return shutdown
}

/**
 * Polls GET {baseUrl}/healthz until it answers 200 or attempts run out.
 * Used by the demo harness (before driving a spawned agent) and by anything
 * that needs to gate on a downstream dependency being ready.
 */
export async function waitForHealthz(
  baseUrl,
  { attempts = 50, delayMs = 100, fetchImpl = globalThis.fetch } = {},
) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${baseUrl}/healthz`)
      if (response.ok) return response.json()
      lastError = new Error(`healthz answered ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`${baseUrl} never became healthy: ${lastError?.message}`, {
    cause: lastError,
  })
}
