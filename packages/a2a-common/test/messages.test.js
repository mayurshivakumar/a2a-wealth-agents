import { Role } from '@a2a-js/sdk'
import { describe, expect, it } from 'vitest'
import {
  artifactData,
  createAgentMessage,
  createDataPart,
  createTextPart,
  createUserMessage,
  extractDataParts,
  extractText,
  findArtifact,
  firstDataPart,
} from '../src/messages.js'

describe('part builders', () => {
  it('builds $case-shaped text and data parts', () => {
    expect(createTextPart('hello')).toEqual({
      content: { $case: 'text', value: 'hello' },
      mediaType: 'text/plain',
    })
    expect(createDataPart({ a: 1 }, { schemaName: 'portfolio-v1' })).toEqual({
      content: { $case: 'data', value: { a: 1 } },
      mediaType: 'application/json',
      metadata: { schema: 'portfolio-v1' },
    })
  })

  it('rejects empty text and non-object data', () => {
    expect(() => createTextPart('  ')).toThrow(/non-empty/)
    expect(() => createDataPart('nope')).toThrow(/object payload/)
  })
})

describe('message builders', () => {
  it('builds a user message with text and data parts', () => {
    const message = createUserMessage({
      text: 'context',
      data: { rawText: 'holdings' },
      schemaName: 'portfolio-request-v1',
      contextId: 'ctx-1',
      taskId: 'task-1',
      idFactory: () => 'fixed-id',
    })
    expect(message).toMatchObject({
      messageId: 'fixed-id',
      contextId: 'ctx-1',
      taskId: 'task-1',
      role: Role.ROLE_USER,
      extensions: [],
      referenceTaskIds: [],
    })
    expect(message.parts).toHaveLength(2)
  })

  it('builds an agent message and requires at least one part', () => {
    const message = createAgentMessage({ text: 'done', idFactory: () => 'id' })
    expect(message.role).toBe(Role.ROLE_AGENT)
    expect(() => createUserMessage({ idFactory: () => 'id' })).toThrow(
      /at least one part/,
    )
  })
})

describe('extractors', () => {
  const message = createUserMessage({
    parts: [
      createTextPart('line one'),
      createDataPart({ n: 1 }),
      createTextPart('line two'),
      createDataPart({ n: 2 }),
    ],
    idFactory: () => 'id',
  })

  it('joins text parts and lists data parts', () => {
    expect(extractText(message)).toBe('line one\nline two')
    expect(extractDataParts(message)).toEqual([{ n: 1 }, { n: 2 }])
    expect(firstDataPart(message)).toEqual({ n: 1 })
  })

  it('finds artifacts by name and reads their data part', () => {
    const task = {
      artifacts: [
        { name: 'first', parts: [createDataPart({ id: 'a' })] },
        { name: 'target-allocation', parts: [createDataPart({ id: 'b' })] },
      ],
    }
    expect(findArtifact(task).name).toBe('first')
    expect(findArtifact(task, 'target-allocation').name).toBe(
      'target-allocation',
    )
    expect(artifactData(findArtifact(task, 'target-allocation'))).toEqual({
      id: 'b',
    })
    expect(findArtifact({}, 'missing')).toBeUndefined()
  })
})
