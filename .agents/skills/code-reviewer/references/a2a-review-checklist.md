# A2A Review Checklist

## Contract

- Do discovery, JSON-RPC (`POST /a2a`), `/healthz`, `/schemas/{name}.json`, agent-card, message, and task behaviors remain compatible with the v1-only contract?
- Does every POST build and pass a `ServerCallContext` and validate `A2A-Version: 1.0`, with an absent header treated as 0.3 and rejected with `-32009`?
- Do cards use `supportedInterfaces[].protocolBinding`, per-interface `protocolVersion`, and `capabilities` including `extensions: []`, without v0.3 top-level fields?
- Are protobuf JSON wire fixtures (`TASK_STATE_*`/`ROLE_*` strings) kept distinct from the numeric-enum/oneof objects used in-process, with no string-literal state comparisons in code?
- Does every `execute()` turn — including follow-up turns — publish a `task` or `message` event first?
- Are card capabilities, skill `schema:`/`produces:` tags, and the JSON-RPC error map (`-32602`, `-32601`, `-32001`, `-32002`, `-32004`, `-32009`) truthful and intact?
- Are payload type, size, and streaming constraints preserved, with SSE served through the `a2a-common` bridge and `compression: false`?
- Are public errors stable and non-sensitive?

## State and identifiers

- Does one `contextId` group all of a conversation's tasks across agents?
- Are terminal tasks left immutable, with follow-up work opened as a new task under the same `contextId`?
- Is all state in-memory (task stores, registries, caches), with no persistence smuggled in and restart understood as a clean slate?
- Are time-dependent tests deterministic?

## Async and lifecycle

- Are discovery, remote delivery, and long-running work bounded by validated timeouts?
- Does caller cancellation combine correctly with timeout cancellation?
- Does partial startup roll back in reverse order?
- Are servers, SSE streams, and tracing resources stopped and awaited?

## Determinism and tracing

- Does the LLM run only in the Orchestrator, with model runs injected in tests and the keyless `--scripted` path preserved?
- Do agent servers stay deterministic and reproducible — no model calls, no uninjected randomness or clocks?
- Are inbound `data` Parts Zod-parsed at every boundary and artifacts validated against their `produces` contract before publish?
- Does disabled or failed tracing leave application behavior unchanged?

## Logging and security

- Are stable messages paired with structured metadata?
- Are errors passed as `{ err: error }`?
- Are keys, authorization values, full payloads, and raw holdings pastes absent from logs?
- Are configured remote URLs and payloads treated as untrusted boundaries?

## Tests

- Are remote clients or fetch, model runners, tracing helpers, loggers, task stores, clocks, IDs, process objects, and server factories injected where deterministic control is needed?
- Is there focused regression coverage for success and failure?
- Do wire-contract changes exercise an in-process `DefaultRequestHandler` on an ephemeral port or real loopback HTTP?
- Do tests use `noopLogger` unless logging is asserted?
- Do all resources close when assertions or setup fail?
