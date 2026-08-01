import { Role, TaskState } from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentCard } from '../src/card.js'
import { publishStatus, publishTaskSubmitted } from '../src/executor-helpers.js'
import { createA2AServer } from '../src/server.js'

const applications = []
const a2aHeaders = {
  'content-type': 'application/json',
  'a2a-version': '1.0',
}

function cardFor({ streaming }) {
  return (baseUrl) =>
    createAgentCard({
      name: 'Test Agent',
      description: 'Bridge test agent',
      baseUrl,
      streaming,
      skills: [
        {
          id: 'echo',
          name: 'Echo',
          description: 'Echoes a response',
          tags: [
            'test',
            'schema:portfolio-request-v1',
            'produces:portfolio-v1',
          ],
        },
      ],
    })
}

const echoExecutor = {
  async execute(requestContext, eventBus) {
    eventBus.publish(
      AgentEvent.message({
        messageId: 'response-message',
        contextId: requestContext.contextId,
        taskId: requestContext.taskId,
        role: Role.ROLE_AGENT,
        parts: [
          {
            content: { $case: 'text', value: 'test response' },
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

const streamingExecutor = {
  async execute(requestContext, eventBus) {
    publishTaskSubmitted(eventBus, requestContext)
    publishStatus(
      eventBus,
      requestContext,
      TaskState.TASK_STATE_WORKING,
      'thinking',
    )
    publishStatus(eventBus, requestContext, TaskState.TASK_STATE_COMPLETED)
    eventBus.finished()
  },
  async cancelTask() {},
}

async function startTestServer({
  streaming = false,
  executor = echoExecutor,
  logger,
} = {}) {
  const application = createA2AServer({
    host: 'localhost',
    port: 0,
    cardFor: cardFor({ streaming }),
    executor,
    logger,
  })
  await application.start()
  applications.push(application)
  return application
}

function rpcPayload(method = 'SendMessage', params) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 'request-1',
    method,
    params: params ?? {
      message: {
        role: 'ROLE_USER',
        messageId: 'user-message',
        parts: [{ text: 'hello', mediaType: 'text/plain' }],
      },
    },
  })
}

function parseSseFrames(payloadText) {
  return payloadText
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n')
      const event = lines
        .find((line) => line.startsWith('event: '))
        ?.slice('event: '.length)
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('')
      return { event: event ?? 'message', data: JSON.parse(data) }
    })
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('Hapi A2A bridge', () => {
  it('serves /healthz with name and version once started', async () => {
    const application = await startTestServer()
    const health = await application.server.inject('/healthz')
    expect(health.statusCode).toBe(200)
    expect(health.result).toEqual({ name: 'Test Agent', version: '1.0.0' })
  })

  it('serves a v1.0 card whose interface URL matches the bound port', async () => {
    const application = await startTestServer()
    const boundPort = application.server.info.port
    const card = await application.server.inject('/.well-known/agent-card.json')
    expect(card.statusCode).toBe(200)
    expect(card.result).toMatchObject({
      name: 'Test Agent',
      supportedInterfaces: [
        {
          url: `http://localhost:${boundPort}/a2a`,
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        },
      ],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        extensions: [],
      },
      securitySchemes: {},
      signatures: [],
    })
    expect(card.result).not.toHaveProperty('protocolVersion')
    expect(card.result).not.toHaveProperty('url')
  })

  it('serves Zod-generated JSON schemas and 404s unknown names', async () => {
    const application = await startTestServer()
    const known = await application.server.inject('/schemas/portfolio-v1.json')
    expect(known.statusCode).toBe(200)
    expect(known.result).toHaveProperty('type', 'object')

    const unknown = await application.server.inject(
      '/schemas/portfolio-v9.json',
    )
    expect(unknown.statusCode).toBe(404)
  })

  it('handles a unary SendMessage', async () => {
    const application = await startTestServer()
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: rpcPayload(),
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toMatchObject({
      jsonrpc: '2.0',
      id: 'request-1',
      result: {
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'test response', mediaType: 'text/plain' }],
        },
      },
    })
  })

  it('maps malformed JSON and invalid envelopes to -32602', async () => {
    const application = await startTestServer()

    const malformed = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: '{bad json',
    })
    expect(malformed.statusCode).toBe(200)
    expect(malformed.result).toMatchObject({
      id: null,
      error: { code: -32602 },
    })

    const invalid = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'SendMessage' }),
    })
    expect(invalid.result.error.code).toBe(-32602)
  })

  it('rejects a missing A2A-Version header with -32009', async () => {
    const application = await startTestServer()
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: { 'content-type': 'application/json' },
      payload: rpcPayload(),
    })
    expect(response.result).toMatchObject({
      id: 'request-1',
      error: { code: -32009 },
    })
  })

  it('rejects an explicit version mismatch (0.3) with -32009', async () => {
    const application = await startTestServer()
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: { 'content-type': 'application/json', 'a2a-version': '0.3' },
      payload: rpcPayload(),
    })
    expect(response.result.error.code).toBe(-32009)
  })

  it('rejects legacy method names with -32601', async () => {
    const application = await startTestServer()
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: rpcPayload('message/send'),
    })
    expect(response.result.error.code).toBe(-32601)
  })

  it('rejects streaming sends when the card disables streaming (-32004)', async () => {
    const application = await startTestServer({ streaming: false })
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: rpcPayload('SendStreamingMessage'),
    })
    expect(response.result.error.code).toBe(-32004)
  })

  it('streams SSE frames for SendStreamingMessage on a streaming card', async () => {
    const application = await startTestServer({
      streaming: true,
      executor: streamingExecutor,
    })
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: rpcPayload('SendStreamingMessage'),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')

    const frames = parseSseFrames(response.payload)
    expect(frames.length).toBe(3)
    for (const frame of frames) {
      expect(frame.event).toBe('message')
      expect(frame.data).toMatchObject({ jsonrpc: '2.0', id: 'request-1' })
    }
    // Wire form discriminates StreamResponse by member name.
    expect(frames[0].data.result).toHaveProperty('task')
    expect(frames[0].data.result.task.status.state).toBe('TASK_STATE_SUBMITTED')
    expect(frames[1].data.result).toHaveProperty('statusUpdate')
    expect(frames[1].data.result.statusUpdate.status.state).toBe(
      'TASK_STATE_WORKING',
    )
    expect(frames[2].data.result.statusUpdate.status.state).toBe(
      'TASK_STATE_COMPLETED',
    )
  })

  it('answers pre-stream errors as plain JSON, not SSE (-32001)', async () => {
    const application = await startTestServer({
      streaming: true,
      executor: streamingExecutor,
    })
    const response = await application.server.inject({
      method: 'POST',
      url: '/a2a',
      headers: a2aHeaders,
      payload: rpcPayload('SubscribeToTask', {
        tenant: '',
        id: 'no-such-task',
      }),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.result.error.code).toBe(-32001)
  })

  it('does not expose unrelated routes', async () => {
    const application = await startTestServer()
    expect((await application.server.inject('/')).statusCode).toBe(404)
  })

  it('logs one structured line per request via the injected logger', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    const application = await startTestServer({ logger })

    await application.server.inject('/healthz')

    expect(logger.info).toHaveBeenCalledWith(
      'request completed',
      expect.objectContaining({
        method: 'get',
        path: '/healthz',
        status: 200,
        ms: expect.any(Number),
      }),
    )
  })
})
