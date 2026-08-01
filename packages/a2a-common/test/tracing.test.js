import { SpanKind } from '@opentelemetry/api'
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { afterEach, describe, expect, it } from 'vitest'
// ONLY the tracing module may load statically: http instrumentation must
// register before @hapi/hapi (and its node:http require) enters the module
// graph — the same first-import rule the apps follow via src/telemetry.js.
import { initTracing } from '../src/tracing.js'

let tracing
let application

afterEach(async () => {
  await application?.stop()
  await tracing?.shutdown()
})

describe('initTracing', () => {
  it('is a complete no-op without processors or OTEL_TRACING', () => {
    const idle = initTracing({ serviceName: 'noop-test' })
    expect(idle.enabled).toBe(false)
  })

  it('propagates one traceId across a real A2A HTTP hop', async () => {
    const exporter = new InMemorySpanExporter()
    tracing = initTracing({
      serviceName: 'trace-test',
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })
    expect(tracing.enabled).toBe(true)

    // Everything that touches node:http loads AFTER instrumentation.
    const [
      { createA2AServer },
      { createAgentCard },
      { createRemoteClientFactory },
      { createUserMessage },
    ] = await Promise.all([
      import('../src/server.js'),
      import('../src/card.js'),
      import('../src/client.js'),
      import('../src/messages.js'),
    ])
    const { AgentEvent } = await import('@a2a-js/sdk/server')
    const { Role } = await import('@a2a-js/sdk')

    const echoExecutor = {
      async execute(requestContext, eventBus) {
        eventBus.publish(
          AgentEvent.message({
            messageId: 'trace-echo',
            contextId: requestContext.contextId,
            taskId: requestContext.taskId,
            role: Role.ROLE_AGENT,
            parts: [
              {
                content: { $case: 'text', value: 'ok' },
                mediaType: 'text/plain',
              },
            ],
            extensions: [],
            referenceTaskIds: [],
          }),
        )
        eventBus.finished()
      },
      async cancelTask() {},
    }

    application = createA2AServer({
      host: 'localhost',
      port: 0,
      cardFor: (baseUrl) =>
        createAgentCard({
          name: 'Trace Agent',
          description: 'traced',
          baseUrl,
          streaming: false,
          skills: [
            { id: 'echo', name: 'Echo', description: 'echo', tags: ['test'] },
          ],
        }),
      executor: echoExecutor,
    })
    const baseUrl = await application.start()

    const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
    const client = await factory.createFromUrl(baseUrl)
    await client.sendMessage({
      tenant: '',
      configuration: {
        acceptedOutputModes: ['text/plain'],
        returnImmediately: false,
      },
      message: createUserMessage({ text: 'trace me' }),
    })

    await tracing.flush()
    const spans = exporter.getFinishedSpans()
    const clientSpans = spans.filter((span) => span.kind === SpanKind.CLIENT)
    const serverSpans = spans.filter((span) => span.kind === SpanKind.SERVER)
    expect(clientSpans.length).toBeGreaterThan(0)
    expect(serverSpans.length).toBeGreaterThan(0)

    // The POST /a2a server span must live in the SAME trace as a client span
    // and be its child — W3C context crossed the wire.
    const a2aServerSpan = serverSpans.find((span) =>
      String(
        span.attributes['http.target'] ?? span.attributes['url.path'] ?? '',
      ).includes('/a2a'),
    )
    expect(a2aServerSpan).toBeDefined()
    const matchingClient = clientSpans.find(
      (span) =>
        span.spanContext().traceId === a2aServerSpan.spanContext().traceId,
    )
    expect(matchingClient).toBeDefined()
    expect(
      a2aServerSpan.parentSpanContext?.spanId ?? a2aServerSpan.parentSpanId,
    ).toBe(matchingClient.spanContext().spanId)
  })
})
