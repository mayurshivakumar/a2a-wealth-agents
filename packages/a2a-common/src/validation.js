import { Message } from '@a2a-js/sdk'
import { RequestMalformedError } from '@a2a-js/sdk/errors'

/**
 * Converts Zod issues into the wire-facing RequestMalformedError (-32602).
 * Error `metadata` values must be strings, so the structured issue list is
 * JSON-stringified into `metadata.issues` and summarized in the message.
 */
export function requestMalformedFromZod(issues, { pathPrefix } = {}) {
  const summary = issues
    .map((issue) => {
      const path = issue.path?.length
        ? issue.path.join('.')
        : (pathPrefix ?? 'request')
      return `${path}: ${issue.message}`
    })
    .join('; ')
  return new RequestMalformedError({
    message: summary,
    metadata: { issues: JSON.stringify(issues) },
  })
}

/** A single-issue convenience for hand-written validation failures. */
export function requestMalformed(path, message) {
  return requestMalformedFromZod([{ path: [path], message }])
}

/**
 * Parses a wire-form message (flattened parts, string enums) into the SDK's
 * in-process shape so extractText/firstDataPart work on it. Used by
 * `validateRequest` middleware, which sees raw JSON-RPC params.
 */
export function parseWireMessage(wireMessage) {
  if (wireMessage === undefined || wireMessage === null) {
    throw requestMalformed('message', 'a message is required')
  }
  try {
    return Message.fromJSON(wireMessage)
  } catch (error) {
    throw new RequestMalformedError({
      message: 'message: not a valid A2A message',
      cause: error,
    })
  }
}
