import { PassThrough } from 'node:stream'
import Hapi from '@hapi/hapi'
import {
  A2A_VERSION_HEADER,
  Extensions,
  HTTP_EXTENSION_HEADER,
  formatSSEErrorEvent,
  formatSSEEvent,
} from '@a2a-js/sdk'
import { toJsonRpcError } from '@a2a-js/sdk/errors'
import {
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  defaultServerCallContextBuilder,
  validateVersion,
} from '@a2a-js/sdk/server'
import { schemaNames, toJsonSchema } from '@wealth/schemas'
import { noopLogger } from './logger.js'
import { createTaskStore } from './task-store.js'

const INTERNAL_ERROR = -32603

// The SDK bundles a separate copy of the error classes into each entrypoint,
// so an instanceof check inside the server chunk does not recognize errors
// constructed from '@a2a-js/sdk/errors' (and vice versa). Map with the
// transport handler's copy first (covers SDK-internal errors), and when that
// degrades to INTERNAL_ERROR retry with the errors-entrypoint mapper (covers
// RequestMalformedError etc. thrown by validateRequest middleware).
function mapJsonRpcError(error) {
  const primary = JsonRpcTransportHandler.mapToJSONRPCError(error)
  if (primary?.code !== INTERNAL_ERROR) return primary
  const fallback = toJsonRpcError(error)
  return fallback?.code !== INTERNAL_ERROR ? fallback : primary
}

function isAsyncIterable(value) {
  return value && typeof value[Symbol.asyncIterator] === 'function'
}

function getHeader(request, name) {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value.join(',') : value
}

function createServerCallContext(request) {
  return defaultServerCallContextBuilder({
    extensions: Extensions.parseServiceParameter(
      getHeader(request, HTTP_EXTENSION_HEADER),
    ),
    user: undefined,
    headers: request.headers,
    requestedVersion: getHeader(request, A2A_VERSION_HEADER),
  })
}

function safeParseJson(payload) {
  try {
    return typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch {
    // Malformed bodies are left for the transport handler to reject.
    return undefined
  }
}

function extractJsonRpcId(payload) {
  const value = safeParseJson(payload)
  const id = value?.id
  if (
    typeof id === 'string' ||
    (typeof id === 'number' && Number.isInteger(id)) ||
    id === null
  ) {
    return id
  }
  return null
}

/**
 * Pumps a JSON-RPC streaming result (an async iterator of complete JSON-RPC
 * envelopes) into a PassThrough as SSE frames. Mirrors the SDK's express
 * adapter: every frame is `data: <envelope>\n\n` via formatSSEEvent; a
 * mid-stream failure becomes an `event: error` frame carrying the mapped
 * JSON-RPC error envelope. Exported separately so the error path is unit
 * testable without fabricating a transport failure.
 */
export function writeSseStream({
  iterator,
  firstResult,
  requestId,
  logger = noopLogger,
  onDone,
}) {
  const stream = new PassThrough()
  // A client abort can destroy the stream while a write is still in flight;
  // every write (including the error-frame write) must tolerate that.
  const safeWrite = (chunk) => {
    if (!stream.destroyed && stream.writable) stream.write(chunk)
  }
  ;(async () => {
    try {
      if (!firstResult.done) {
        safeWrite(formatSSEEvent(firstResult.value))
      }
      for (;;) {
        const next = await iterator.next()
        if (next.done) break
        safeWrite(formatSSEEvent(next.value))
      }
    } catch (error) {
      logger.warn('sse stream error', { err: error })
      safeWrite(
        formatSSEErrorEvent({
          jsonrpc: '2.0',
          id: requestId,
          error: mapJsonRpcError(error),
        }),
      )
    } finally {
      onDone?.()
      if (!stream.destroyed) stream.end()
    }
  })()
  return stream
}

/**
 * Hapi host around the A2A SDK request pipeline.
 *
 * Routes: POST /a2a (JSON-RPC, unary + SSE streaming), GET
 * /.well-known/agent-card.json, GET /healthz ({name, version}; 503 until
 * started), GET /schemas/{name}.json (Zod-generated JSON schemas).
 *
 * The agent card is built AFTER bind via `cardFor(baseUrl)` so servers on
 * ephemeral ports (port: 0 in tests) never advertise a wrong URL.
 *
 * `compression: false` is load-bearing: Hapi would otherwise gzip
 * text/event-stream responses (undici sends accept-encoding by default) and
 * zlib buffering destroys event-at-a-time delivery.
 *
 * `validateRequest({ method, message })` is the "Zod validation at the
 * boundary" middleware: it runs for SendMessage/SendStreamingMessage before
 * the SDK pipeline, and anything it throws (typically RequestMalformedError)
 * becomes a JSON-RPC error envelope — no task record is created. Executor
 * exceptions, by contrast, are converted by the SDK into FAILED tasks, so
 * inbound-contract rejection MUST happen here to reach the wire as -32602.
 */
export function createA2AServer({
  host = 'localhost',
  port,
  cardFor,
  executor,
  validateRequest,
  taskStore = createTaskStore(),
  logger = noopLogger,
}) {
  const server = Hapi.server({
    host,
    port,
    compression: false,
    routes: {
      cors: false,
    },
  })

  const state = { card: null, requestHandler: null, transportHandler: null }

  server.ext('onPreResponse', (request, h) => {
    const status = request.response.isBoom
      ? request.response.output.statusCode
      : request.response.statusCode
    logger.info('request completed', {
      method: request.method,
      path: request.path,
      status,
      ms: Date.now() - request.info.received,
    })
    return h.continue
  })

  const notReady = (h) => h.response({ status: 'starting' }).code(503)

  server.route([
    {
      method: 'GET',
      path: '/healthz',
      handler: (_request, h) =>
        state.card
          ? h
              .response({ name: state.card.name, version: state.card.version })
              .type('application/json')
          : notReady(h),
    },
    {
      method: 'GET',
      path: '/.well-known/agent-card.json',
      handler: async (_request, h) =>
        state.requestHandler
          ? h
              .response(await state.requestHandler.getAgentCard())
              .type('application/json')
          : notReady(h),
    },
    {
      method: 'GET',
      path: '/schemas/{name}.json',
      handler: (request, h) => {
        const { name } = request.params
        if (!schemaNames().includes(name)) {
          return h.response({ error: `unknown schema: ${name}` }).code(404)
        }
        return h.response(toJsonSchema(name)).type('application/json')
      },
    },
    {
      method: 'POST',
      path: '/a2a',
      options: {
        payload: {
          allow: 'application/json',
          maxBytes: 1_048_576,
          output: 'data',
          parse: false,
        },
      },
      handler: async (request, h) => {
        if (!state.transportHandler) return notReady(h)

        const payload = Buffer.isBuffer(request.payload)
          ? request.payload.toString('utf8')
          : request.payload
        const context = createServerCallContext(request)
        let response

        try {
          validateVersion(context.requestedVersion, state.card, 'JSONRPC')
          if (validateRequest) {
            const parsedBody = safeParseJson(payload)
            const method = parsedBody?.method
            if (method === 'SendMessage' || method === 'SendStreamingMessage') {
              validateRequest({ method, message: parsedBody?.params?.message })
            }
          }
          response = await state.transportHandler.handle(payload, context)
        } catch (error) {
          response = {
            jsonrpc: '2.0',
            id: extractJsonRpcId(payload),
            error: mapJsonRpcError(error),
          }
        }

        if (isAsyncIterable(response)) {
          const iterator = response[Symbol.asyncIterator]()
          const requestId = extractJsonRpcId(payload)

          // Pull the first event BEFORE committing to SSE so pre-stream
          // failures (e.g. SubscribeToTask on an unknown task) answer as a
          // plain JSON-RPC error envelope, exactly like the express adapter.
          let firstResult
          try {
            firstResult = await iterator.next()
          } catch (error) {
            return h
              .response({
                jsonrpc: '2.0',
                id: requestId,
                error: mapJsonRpcError(error),
              })
              .code(200)
              .type('application/json')
          }

          let pumpDone = false
          let clientGone = false
          const onClientGone = () => {
            if (pumpDone || clientGone) return
            clientGone = true
            logger.info('sse client disconnected', { path: request.path })
            iterator.return?.().catch(() => {})
          }
          // request.events.disconnect is Hapi's abort signal; the raw res
          // 'close' covers runtimes where it doesn't fire after the request
          // body was consumed. pumpDone guards the normal-completion 'close'.
          request.events.once('disconnect', onClientGone)
          request.raw.res.once('close', onClientGone)

          const stream = writeSseStream({
            iterator,
            firstResult,
            requestId,
            logger,
            onDone: () => {
              pumpDone = true
            },
          })

          const sse = h
            .response(stream)
            .code(200)
            .type('text/event-stream')
            .header('cache-control', 'no-cache')
            .header('connection', 'keep-alive')
            .header('x-accel-buffering', 'no')
          if (context.activatedExtensions?.length) {
            sse.header(
              HTTP_EXTENSION_HEADER,
              Extensions.toServiceParameter(context.activatedExtensions),
            )
          }
          return sse
        }

        const hapiResponse = h
          .response(response)
          .code(200)
          .type('application/json')
        if (context.activatedExtensions?.length) {
          hapiResponse.header(
            HTTP_EXTENSION_HEADER,
            Extensions.toServiceParameter(context.activatedExtensions),
          )
        }
        return hapiResponse
      },
    },
  ])

  async function start() {
    await server.start()
    const baseUrl = `http://${host}:${server.info.port}`
    state.card = cardFor(baseUrl)
    state.requestHandler = new DefaultRequestHandler(
      state.card,
      taskStore,
      executor,
    )
    state.transportHandler = new JsonRpcTransportHandler(state.requestHandler)
    logger.info('a2a server listening', { name: state.card.name, url: baseUrl })
    return baseUrl
  }

  return {
    server,
    taskStore,
    get card() {
      return state.card
    },
    get requestHandler() {
      return state.requestHandler
    },
    start,
    stop: (options) => server.stop(options),
  }
}
