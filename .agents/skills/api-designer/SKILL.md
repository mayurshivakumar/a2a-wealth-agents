---
name: api-designer
description: Design or evolve this repository's A2A HTTP and JSON-RPC contracts, agent cards, message, task, and streaming behavior, versioned Zod data contracts, health and schema endpoints, and cross-agent compatibility. Use for endpoint changes, protocol validation, agent-card edits, error semantics, transport changes, or backward-compatibility reviews.
---

# A2A API Designer

Treat the installed `@a2a-js/sdk` 1.0.0 types and handlers plus existing loopback tests as the executable contract.

## Workflow

1. Map the affected client, Hapi route, A2A SDK handler, executor, event bus, and response path.
2. Preserve the standard discovery path and JSON-RPC transport unless the request explicitly changes the external contract.
3. Define request, response, validation, error, timeout, and task-lifecycle behavior before implementation.
4. Keep agent-card capabilities synchronized with actual server and executor behavior, including `extensions: []` and each skill's `schema:<input>` / `produces:<output>` tags.
5. Add real loopback HTTP tests for discovery or wire-format changes and focused unit tests for pure message helpers.
6. Document compatibility impact in the handoff when an externally visible contract changes.

## Constraints

- Do not impose conventional resource-oriented HTTP patterns on the A2A JSON-RPC endpoint (`POST /a2a`).
- Preserve each agent's declared interaction mode: Portfolio blocking `SendMessage`, Strategy SSE streaming, Tax long-running tasks with `input-required` and cancel. Streaming goes through the `packages/a2a-common` SSE bridge and must never be gzip-buffered.
- Preserve the v1-only contract and disabled v0.3 compatibility layer unless a change explicitly authorizes a staged compatibility model.
- Keep protobuf JSON at the HTTP boundary (`TASK_STATE_*` / `ROLE_*` strings) distinct from the SDK's numeric-enum/oneof objects inside executors and message helpers; never compare states against string literals in code.
- Data contracts live in `@wealth/schemas` as versioned `*-v1` Zod schemas, travel as `data` Parts, and are served as JSON schema at `GET /schemas/{name}.json`.
- Keep health responses minimal (`GET /healthz` returns `{ name, version }`) and avoid exposing configuration or secrets.
- Preserve the unauthenticated localhost-mesh boundary in Slice 0; security schemes and card signatures arrive in Slice 8.
- Treat `contextId` as the key grouping all of a conversation's tasks across agents; tasks are immutable once terminal.

## References

- Read [references/a2a-contract.md](references/a2a-contract.md) for the current transport and data flow.
- Read [references/json-rpc-errors.md](references/json-rpc-errors.md) for validation and failure behavior.
- Read [references/contract-evolution.md](references/contract-evolution.md) before changing public behavior.
