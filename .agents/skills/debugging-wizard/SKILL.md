---
name: debugging-wizard
description: Diagnose reproducible failures in this Node.js A2A agent mesh across startup, discovery, JSON-RPC transport, SSE streams, long-running tasks, remote timeouts, agent execution, Langfuse tracing, shutdown, and Vitest lifecycle. Use for errors, hangs, incorrect responses, missing traces, leaked state, flaky tests, or root-cause analysis.
---

# A2A Debugging

Diagnose before editing. Do not implement a fix when the request asks only for a diagnosis.

## Workflow

1. Reproduce with the smallest deterministic command or focused test.
2. Identify the failing layer: configuration, process startup, Hapi route, A2A SDK transport, message conversion, executor, Orchestrator Agents SDK run, task store, tracing, or shutdown.
3. Gather the exact error, structured log metadata, task state, identifiers, and timing without logging secrets or full payloads.
4. Form one falsifiable hypothesis and test it with a read-only inspection, focused test, or temporary local diagnostic.
5. State the root cause and evidence. If authorized to fix, make one scoped change and add regression coverage.
6. Remove temporary diagnostics, then run the focused test, `npm test`, and `npm run lint`.

## Invariants to check early

- Validate whether the request reused the same A2A `contextId` and whether it targets a task that is already terminal — terminal tasks are immutable, and follow-up work is a new task.
- Confirm the request sends `A2A-Version: 1.0` and uses v1 methods and protobuf JSON shapes before debugging the executor; an absent header is treated as 0.3 and rejected with `-32009`.
- Confirm code compares numeric enum states and roles, never `TASK_STATE_*`/`ROLE_*` wire strings.
- Confirm the LLM runs only in the Orchestrator and every agent server behaves deterministically.
- Confirm timeout cleanup, SSE stream closure, and server/client shutdown.
- Confirm Langfuse failures warn and degrade without blocking startup.

## References

- Read [references/a2a-failure-map.md](references/a2a-failure-map.md) to select the failing layer.
- Read [references/node-debugging-tools.md](references/node-debugging-tools.md) for repository-safe diagnostics.
- Read [references/systematic-debugging.md](references/systematic-debugging.md) for complex or repeated failures.
