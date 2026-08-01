# Vitest Testing

Use Vitest through the repository scripts.

## Strategy

- Unit-test pure configuration, message, store, executor, logger, and tracing behavior with injected dependencies.
- Mock OpenAI model runs; the suite must not require `OPENAI_API_KEY`.
- Use an in-process `DefaultRequestHandler` on an ephemeral port for A2A discovery, JSON-RPC, and SSE transport contracts.
- Use logger spies only when log level, message, or metadata is behavior under test.
- Close every server and tracing client in `afterEach`, `afterAll`, or `finally`.

## Commands

```bash
npm test --workspace apps/tax-agent -- test/executor.test.js
npm test --workspace packages/a2a-common -- test/server.test.js
npm test
npm run lint
```

## Required cases

Cover success, invalid input, malformed output, timeout, partial startup, lifecycle cleanup, configuration errors, disabled tracing, tracing failure, identifier isolation, and new log metadata.
