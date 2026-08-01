# Error Handling

## Boundaries

Validate data where it crosses a boundary:

- Environment values in the `packages/a2a-common` config module.
- Tool arguments and model final output with Zod.
- Inbound A2A payloads through the SDK transport handler, with `data` Parts parsed against their `@wealth/schemas` contract.
- Remote A2A results before the Orchestrator's tools consume them.

## Translation

- Preserve internal error details in structured logs with `{ err: error }`.
- Return stable, non-sensitive messages to A2A callers and model tools.
- Wrap remote failures once, at the client boundary, preserving the original error as `cause`.
- Distinguish timeout failures from other availability failures without exposing URLs or payloads to callers.
- Let startup configuration errors fail fast; let optional Langfuse initialization degrade with a warning.

## Executor behavior

The executor must always publish a terminal event and finish the event bus after a handled run failure, and every `execute()` turn — including follow-up turns — must publish a `task` or `message` event first. Keep schema failures distinct from generic execution failures.

## Tests

Cover validation failures, model failures, remote timeouts, malformed remote results, partial startup rollback, and cleanup failures. Assert public messages and structured log metadata separately.
