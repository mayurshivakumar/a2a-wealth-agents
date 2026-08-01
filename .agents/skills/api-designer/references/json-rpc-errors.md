# JSON-RPC and Validation Failures

## Transport errors

Let the installed A2A SDK 1.0 handler produce its JSON-RPC errors:

- `-32602` `RequestMalformedError` for malformed JSON, invalid request parameters, and Zod contract rejections; stringified Zod issues travel in the error metadata.
- `-32601` for unknown methods, including legacy v0.3 names such as `message/send`.
- `-32001` `TaskNotFoundError` for an unknown task ID.
- `-32002` `TaskNotCancelableError` when cancelling a task that is already terminal.
- `-32004` `UnsupportedOperationError` for capabilities a card does not declare — a streaming send to Portfolio, or `resubscribeTask` on a terminal task.
- `-32009` `VersionNotSupportedError` when `A2A-Version` is absent, invalid, or unsupported; an absent header becomes `0.3` in `ServerCallContext` and is rejected by these v1-only servers.

Build a `ServerCallContext` for every POST, call `validateVersion` before dispatch, pass the context to `JsonRpcTransportHandler.handle`, and map thrown version errors with `JsonRpcTransportHandler.mapToJSONRPCError`. Preserve a valid request ID when possible and use `null` for malformed JSON. Return JSON-RPC error envelopes with HTTP 200 when the transport layer processed the HTTP request. Keep Hapi routing, content-type, and payload-limit failures as HTTP concerns.

## Message validation

Accept only in-process user messages with numeric `Role.ROLE_USER` and `data` Parts that Zod-parse against the skill's declared input contract; the messy holdings paste into Portfolio is the one permitted `text` Part input. Reject unparseable contracts with `-32602` rather than coercing silently, and validate artifacts against their `produces` contract before publishing.

## Boundary translation

- Log the internal failure with stable metadata and `{ err: error }`.
- Return a stable executor message for validation or execution failure.
- Wrap remote transport failures once, at the client boundary, and preserve the original error as `cause`.
- Distinguish a timeout in the user-safe remote error without exposing payloads.
- Always publish a terminal event and complete the event bus after a handled executor failure.

Add regression tests for both the wire envelope and the public message. Do not assert private SDK implementation details.
