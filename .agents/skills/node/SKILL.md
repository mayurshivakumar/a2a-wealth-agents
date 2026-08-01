---
name: node
description: Build, debug, review, or test this repository's Node.js 20+ A2A services using plain ESM JavaScript, Hapi, Vitest, Winston, dependency injection, validated configuration, timeout handling, and deterministic lifecycle cleanup. Use for changes under packages/ or apps/, runtime failures, hanging tests, server lifecycle work, and Node dependency investigation.
---

# Node A2A Services

Start by reading the repository `AGENTS.md`, the affected workspace module, its focused tests, and that workspace's `package.json`.

## Workflow

1. Preserve the existing workspace boundary and inject network, model, tracing, clock, or logger dependencies when testing behavior.
2. Keep runtime code in plain `.js` ESM with async/await, two-space indentation, no semicolons, and single quotes.
3. Use Hapi through the `@wealth/a2a-common` bridge (`packages/a2a-common/src/server.js`) and the existing `@a2a-js/sdk` helpers. Do not introduce another server framework or transport abstraction.
4. Route configuration through the shared config module in `packages/a2a-common`; keep reusable logger parameters defaulted to `noopLogger`.
5. Add focused Vitest coverage in the affected workspace. Use real loopback HTTP only when discovery, JSON-RPC, or SSE transport behavior matters.
6. Verify with the narrowest test first, then root `npm test` and `npm run lint`.

## Repository invariants

- Log stable messages plus structured metadata through the injected Winston-compatible logger. Pass failures as `{ err: error }`.
- Never log keys, authorization data, or complete user/model payloads.
- The Orchestrator is the only process that runs an LLM; every agent server stays deterministic and reproducible.
- Treat the A2A `contextId` as the key that groups all of a conversation's tasks across agents. Langfuse trace sessions are a separate, Orchestrator-only concern.
- Keep standardized financial data in Zod-validated `data` Parts; state is in-memory by design, and tasks are immutable once terminal.
- Bound remote calls with the configured timeout and clean up timers, servers, SDKs, and clients deterministically.
- Preserve disabled-by-default tracing and graceful degradation when Langfuse keys are absent.

## References

- Read [rules/async-patterns.md](rules/async-patterns.md) for timeouts, cleanup, and concurrent work.
- Read [rules/error-handling.md](rules/error-handling.md) for validation and boundary failures.
- Read [rules/environment.md](rules/environment.md) for configuration changes.
- Read [rules/graceful-shutdown.md](rules/graceful-shutdown.md) for process lifecycle work.
- Read [rules/logging.md](rules/logging.md) for structured logging.
- Read [rules/modules.md](rules/modules.md) for ESM module boundaries.
- Read [rules/node-modules-exploration.md](rules/node-modules-exploration.md) before assuming SDK behavior.
- Read [rules/testing.md](rules/testing.md) for Vitest and loopback HTTP patterns.
- Read [rules/flaky-tests.md](rules/flaky-tests.md) when a test is nondeterministic.
- Read [rules/stuck-processes-and-tests.md](rules/stuck-processes-and-tests.md) when a process does not exit.
