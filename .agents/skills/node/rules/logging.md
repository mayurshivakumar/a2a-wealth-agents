# Structured Logging

Use the injected Winston-compatible logger. Reusable modules default to `noopLogger`; each process entrypoint (`apps/*/src/index.js`) owns the real logger.

## Shape

- Write a stable event message and attach variable data as metadata.
- Pass errors as `{ err: error }` so the logger normalizes name, message, and stack.
- Add component context with child loggers.
- Use `debug` for lifecycle detail, `info` for useful operational events, `warn` for recoverable degradation, and `error` for failed work.

## Sensitive data

Never log:

- OpenAI or Langfuse keys
- Authorization values
- Complete inbound messages
- Complete model inputs or outputs
- Conversation history

Identifiers, agent names, URLs already intended for local operation, statuses, and durations are acceptable when they do not reveal payload contents.

## Tests

Inject logger spies when asserting event level, stable message, or metadata. Otherwise use `noopLogger` so tests stay quiet.
