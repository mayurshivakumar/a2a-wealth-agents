# Current A2A Contract

## HTTP surface

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/.well-known/agent-card.json` | Return the SDK-backed agent card as JSON. |
| POST | `/a2a` | Build a v1 `ServerCallContext`, validate the requested version, pass raw JSON text to the A2A JSON-RPC transport, and return its response as JSON — or as an SSE stream for streaming methods. |
| GET | `/healthz` | Return `{ name, version }`. |
| GET | `/schemas/{name}.json` | Return the JSON schema generated from the matching `@wealth/schemas` Zod contract. |

The JSON-RPC route accepts only `application/json`, parses the payload as raw data, and bounds its size. It requires `A2A-Version: 1.0`; the SDK defaults an absent header to `0.3`, which these v1-only servers reject with `-32009`. Protocol responses use HTTP 200, including JSON-RPC version, parse, and invalid-request errors. Hapi servers are created with `compression: false` because SSE frames must not be gzip-buffered.

## Agent cards

Each agent server publishes its own card: Portfolio (:4001), Strategy (:4002), and Tax (:4003) in Slice 0, with Risk (:4004), Research (:4005), and the data tier (:4101–:4104) in later slices. Cards use the A2A v1 shape and advertise one `supportedInterfaces` entry with URL `/a2a`, `protocolBinding: 'JSONRPC'`, and per-interface `protocolVersion: '1.0'`. `capabilities` must include `extensions: []`, and `streaming` must be truthful: true for Strategy and Tax, false for Portfolio, whose streaming sends fail with `-32004` as a deliberate negative-path demo. Security schemes, security requirements, and signatures stay empty until Slice 8.

Keep each skill's ID, description, tags, and examples aligned with actual executor behavior; skills carry `schema:<input>` / `produces:<output>` tags naming their `@wealth/schemas` contracts.

## Representations

The HTTP wire uses protobuf JSON: enum strings such as `ROLE_USER`/`ROLE_AGENT` and `TASK_STATE_*`, flattened parts, and PascalCase methods such as `SendMessage`. Inside the SDK boundary, executors and helpers receive numeric enums and `Part.content: { $case, value }` oneofs. Do not validate in-process objects as if they were wire JSON, construct HTTP examples using the in-process shape, or compare task states against string literals in code.

## Message flow

1. Accept a v1 `SendMessage` (blocking, Portfolio) or a streaming send (Strategy over SSE; Tax returns a long-running task observed via `getTask` polling and `resubscribeTask`).
2. Let the SDK convert wire JSON into its numeric-enum/oneof representation.
3. Zod-parse inbound `data` Parts against the skill's declared `@wealth/schemas` contract; the user's messy holdings paste is the one permitted `text` Part input, into Portfolio only.
4. Publish a `task` or `message` event first on every `execute()` turn, then status updates and Zod-validated artifacts.
5. Finish the event bus.

## Identifiers

- `contextId`: groups all of a conversation's tasks across every agent.
- `taskId`: task correlation; tasks are immutable once terminal — follow-up work is a new task under the same `contextId`, carrying `referenceTaskIds` from Slice 1 on.
- `messageId`: unique message identity.

Langfuse trace sessions are an Orchestrator-only concern, kept separate from `contextId`.
