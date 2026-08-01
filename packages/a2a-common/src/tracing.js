import { NodeSDK } from '@opentelemetry/sdk-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { noopLogger } from './logger.js'

/**
 * OpenTelemetry bootstrap for every process in the mesh.
 *
 * - http + undici instrumentation give W3C trace-context propagation across
 *   A2A HTTP calls: the Hapi server side (node:http) and the SDK client side
 *   (undici fetch) join one trace.
 * - No exporter is configured here; span processors are injected — the
 *   Orchestrator passes Langfuse's, tests pass an in-memory one. With no
 *   processors and no OTEL_TRACING=true, this is a complete no-op.
 * - Call `shutdown()` on process exit so buffered spans flush.
 */
export function initTracing({
  serviceName,
  spanProcessors = [],
  enabled = spanProcessors.length > 0 || process.env.OTEL_TRACING === 'true',
  logger = noopLogger,
} = {}) {
  const flush = async () => {
    await Promise.all(
      spanProcessors.map((processor) => processor.forceFlush?.()),
    )
  }

  if (!enabled) {
    return { enabled: false, flush, shutdown: async () => {} }
  }

  // With explicit processors, use exactly those; with none (OTEL_TRACING=true
  // alone) let the SDK read the standard OTEL_EXPORTER_OTLP_* environment.
  const sdk = new NodeSDK({
    serviceName,
    ...(spanProcessors.length > 0 ? { spanProcessors } : {}),
    instrumentations: [new HttpInstrumentation(), new UndiciInstrumentation()],
  })

  try {
    sdk.start()
    logger.info('tracing started', {
      serviceName,
      spanProcessors: spanProcessors.length,
    })
  } catch (error) {
    logger.warn('tracing failed to start; continuing without it', {
      err: error,
    })
    return { enabled: false, flush, shutdown: async () => {} }
  }

  return {
    enabled: true,
    // Span export is asynchronous even with SimpleSpanProcessor — flush
    // before reading exporters (tests) or exiting without shutdown.
    flush,
    shutdown: async () => {
      try {
        await sdk.shutdown()
      } catch (error) {
        logger.warn('tracing shutdown failed', { err: error })
      }
    },
  }
}
