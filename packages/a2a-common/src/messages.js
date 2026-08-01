import { randomUUID } from 'node:crypto'
import { Role } from '@a2a-js/sdk'

// In-process Part shape is the SDK's protobuf oneof form: content.$case
// discriminates the member; the wire JSON flattens it to {text}/{data}.

export function createTextPart(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('A text part needs non-empty text')
  }
  return {
    content: { $case: 'text', value: text },
    mediaType: 'text/plain',
  }
}

export function createDataPart(
  data,
  { schemaName, mediaType = 'application/json' } = {},
) {
  if (data === null || typeof data !== 'object') {
    throw new Error('A data part needs an object payload')
  }
  return {
    content: { $case: 'data', value: data },
    mediaType,
    ...(schemaName ? { metadata: { schema: schemaName } } : {}),
  }
}

function buildParts({ text, data, schemaName, parts }) {
  const resolved = parts ?? [
    ...(text !== undefined ? [createTextPart(text)] : []),
    ...(data !== undefined ? [createDataPart(data, { schemaName })] : []),
  ]
  if (resolved.length === 0) {
    throw new Error('A message needs at least one part')
  }
  return resolved
}

export function createUserMessage({
  text,
  data,
  schemaName,
  parts,
  contextId = '',
  taskId = '',
  metadata,
  idFactory = randomUUID,
} = {}) {
  return {
    messageId: idFactory(),
    contextId,
    taskId,
    role: Role.ROLE_USER,
    ...(metadata ? { metadata } : {}),
    parts: buildParts({ text, data, schemaName, parts }),
    extensions: [],
    referenceTaskIds: [],
  }
}

export function createAgentMessage({
  text,
  data,
  schemaName,
  parts,
  contextId = '',
  taskId = '',
  metadata,
  idFactory = randomUUID,
} = {}) {
  return {
    messageId: idFactory(),
    contextId,
    taskId,
    role: Role.ROLE_AGENT,
    ...(metadata ? { metadata } : {}),
    parts: buildParts({ text, data, schemaName, parts }),
    extensions: [],
    referenceTaskIds: [],
  }
}

function partsOf(message) {
  return Array.isArray(message?.parts) ? message.parts : []
}

export function extractText(message) {
  return partsOf(message)
    .filter((part) => part?.content?.$case === 'text')
    .map((part) => part.content.value)
    .join('\n')
    .trim()
}

export function extractDataParts(message) {
  return partsOf(message)
    .filter((part) => part?.content?.$case === 'data')
    .map((part) => part.content.value)
}

export function firstDataPart(message) {
  return extractDataParts(message)[0]
}

export function findArtifact(task, name) {
  const artifacts = Array.isArray(task?.artifacts) ? task.artifacts : []
  if (name === undefined) return artifacts[0]
  return artifacts.find((artifact) => artifact.name === name)
}

export function artifactData(artifact) {
  const part = (artifact?.parts ?? []).find(
    (candidate) => candidate?.content?.$case === 'data',
  )
  return part?.content.value
}
