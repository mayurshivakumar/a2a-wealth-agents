import { TaskState } from '@a2a-js/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentCard } from '../src/card.js'
import { publishStatus, publishTaskSubmitted } from '../src/executor-helpers.js'
import { createA2AServer, writeSseStream } from '../src/server.js'

const applications = []

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Executor that publishes the initial task, then blocks on a gate the test
// controls — so the test can prove the first frame crossed a REAL socket
// while the remaining events had not been produced yet.
function createGatedExecutor() {
  const gate = deferred()
  const state = { released: false }
  const executor = {
    async execute(requestContext, eventBus) {
      publishTaskSubmitted(eventBus, requestContext)
      await gate.promise
      publishStatus(
        eventBus,
        requestContext,
        TaskState.TASK_STATE_WORKING,
        'working',
      )
      publishStatus(eventBus, requestContext, TaskState.TASK_STATE_COMPLETED)
      eventBus.finished()
    },
    async cancelTask() {},
  }
  return {
    executor,
    release: () => {
      state.released = true
      gate.resolve()
    },
    get released() {
      return state.released
    },
  }
}

async function startStreamingServer({ executor, logger } = {}) {
  const application = createA2AServer({
    host: 'localhost',
    port: 0,
    cardFor: (baseUrl) =>
      createAgentCard({
        name: 'SSE Agent',
        description: 'Streaming test agent',
        baseUrl,
        streaming: true,
        skills: [
          {
            id: 'stream',
            name: 'Stream',
            description: 'streams',
            tags: ['test'],
          },
        ],
      }),
    executor,
    logger,
  })
  const baseUrl = await application.start()
  applications.push(application)
  return { application, baseUrl }
}

function streamingRequestBody() {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 'stream-1',
    method: 'SendStreamingMessage',
    params: {
      message: {
        role: 'ROLE_USER',
        messageId: 'user-message',
        parts: [{ text: 'go', mediaType: 'text/plain' }],
      },
    },
  })
}

async function postStream(baseUrl, { signal } = {}) {
  return fetch(`${baseUrl}/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'a2a-version': '1.0' },
    body: streamingRequestBody(),
    signal,
  })
}

// Reads from the body reader until `predicate(bufferedText)` is true.
async function readUntil(reader, decoder, predicate, previous = '') {
  let buffered = previous
  while (!predicate(buffered)) {
    const { value, done } = await reader.read()
    if (done) break
    buffered += decoder.decode(value, { stream: true })
  }
  return buffered
}

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.stop()),
  )
})

describe('SSE over a real socket', () => {
  it('delivers the first frame before later events exist (no buffering)', async () => {
    const gated = createGatedExecutor()
    const { baseUrl } = await startStreamingServer({ executor: gated.executor })

    const response = await postStream(baseUrl)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('content-encoding')).toBeNull()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const firstChunk = await readUntil(reader, decoder, (text) =>
      text.includes('\n\n'),
    )
    expect(firstChunk).toContain('data: ')
    expect(firstChunk).toContain('TASK_STATE_SUBMITTED')
    // The executor is still gated: the frame arrived before the remaining
    // events were even produced — impossible if anything buffered the stream.
    expect(gated.released).toBe(false)

    gated.release()
    const rest = await readUntil(
      reader,
      decoder,
      (text) => text.includes('TASK_STATE_COMPLETED'),
      firstChunk,
    )
    expect(rest).toContain('TASK_STATE_WORKING')
    expect(rest).toContain('TASK_STATE_COMPLETED')
  })

  it('detaches the iterator when the client disconnects mid-stream', async () => {
    const gated = createGatedExecutor()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }
    const { baseUrl } = await startStreamingServer({
      executor: gated.executor,
      logger,
    })

    const controller = new AbortController()
    const response = await postStream(baseUrl, { signal: controller.signal })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    await readUntil(reader, decoder, (text) => text.includes('\n\n'))

    controller.abort()
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith(
        'sse client disconnected',
        expect.objectContaining({ path: '/a2a' }),
      )
    })

    // The executor finishing after the disconnect must not wedge the server.
    gated.release()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const health = await fetch(`${baseUrl}/healthz`)
    expect(health.status).toBe(200)
  })

  it('turns a mid-stream iterator failure into an SSE error frame', async () => {
    let step = 0
    const iterator = {
      async next() {
        step += 1
        if (step === 1) throw new Error('boom mid-stream')
        return { value: undefined, done: true }
      },
      async return() {
        return { value: undefined, done: true }
      },
    }
    const stream = writeSseStream({
      iterator,
      firstResult: {
        value: { jsonrpc: '2.0', id: 'x', result: { task: {} } },
        done: false,
      },
      requestId: 'x',
    })

    let output = ''
    for await (const chunk of stream) {
      output += chunk.toString()
    }

    expect(output).toContain('data: {"jsonrpc":"2.0","id":"x"')
    expect(output).toContain('event: error')
    const errorFrame = output
      .split('\n\n')
      .find((block) => block.startsWith('event: error'))
    const errorData = JSON.parse(
      errorFrame
        .split('\n')
        .find((line) => line.startsWith('data: '))
        .slice('data: '.length),
    )
    expect(errorData).toMatchObject({ jsonrpc: '2.0', id: 'x' })
    expect(typeof errorData.error.code).toBe('number')
  })
})
