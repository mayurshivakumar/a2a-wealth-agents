# A2A Learning Slice — Design

A scoped-down slice of the full system in `design.md`, built to exercise **every A2A v1.0 concept** with the fewest moving parts. Four processes: one A2A Client (Orchestrator) and three A2A Servers (Portfolio, Strategy, Tax). The Research sub-tree and external data APIs are deferred; the Strategy Agent stubs them.

Built on `@a2a-js/sdk` **v1.0.0** (implements A2A Protocol Specification v1.0; requires Node.js >= 20). Clients use the `ClientFactory`/`Client` API; servers implement `AgentExecutor`s behind a `DefaultRequestHandler`, publishing events through `AgentEvent` factory wrappers.

Each agent is deliberately designed to showcase a *different* A2A interaction pattern, so building the slice teaches the whole protocol.

> **Notation:** task states appear in short form in diagrams (`working`, `input-required`, …) for readability; on the wire v1.0 serializes them as `SCREAMING_SNAKE_CASE` (`TASK_STATE_WORKING`, `TASK_STATE_INPUT_REQUIRED`, …) and the SDK exposes them via the `TaskState` enum. Likewise `role` is `ROLE_USER` / `ROLE_AGENT`.

---

## 1. Topology

```text
                    ┌──────────────────────┐
                    │      User Input      │
                    └──────────┬───────────┘
                               ▼
        ┌─────────────────────────────────────────────┐
        │        WEALTH ORCHESTRATOR (A2A Client)     │
        │  @openai/agents · @a2a-js/sdk client · CLI  │
        │              http://localhost:3000          │
        └──────┬───────────────┬───────────────┬──────┘
               │ JSON-RPC 2.0  │ JSON-RPC 2.0  │ JSON-RPC 2.0
               ▼               ▼               ▼
        ┌────────────┐  ┌────────────┐  ┌────────────┐
        │ PORTFOLIO  │  │  STRATEGY  │  │    TAX     │
        │   :4001    │  │   :4002    │  │   :4003    │
        │ sync msgs  │  │ SSE stream │  │ async task │
        └────────────┘  └────────────┘  └────────────┘
```

| Process | Role | A2A pattern it teaches |
| --- | --- | --- |
| Orchestrator | A2A Client | Discovery via agent cards, routing, task correlation, multi-turn `input-required` handling |
| Portfolio Agent | A2A Server | **Synchronous** `SendMessage`, data Part in → Artifact out, schema rejection |
| Strategy Agent | A2A Server | **Streaming** `SendStreamingMessage` over SSE, incremental status + artifact chunks |
| Tax Agent | A2A Server | **Long-running async Task**: polling with `GetTask`, `input-required` pause, `SubscribeToTask`, `CancelTask` |

---

## 2. Concept coverage matrix

| A2A v1.0 concept | Where it's exercised |
| --- | --- |
| Agent Card / discovery | All three servers expose `/.well-known/agent-card.json`; Orchestrator fetches all cards at startup and builds a routing table from `skills[]` |
| `supportedInterfaces` | Each card declares one JSONRPC interface with `protocolVersion: "1.0"`; Orchestrator validates the version per interface |
| Skills | Each card declares 1–2 skills with `inputModes`/`outputModes` |
| Message + text `Part` | Orchestrator → Strategy ("Apply a Bogleheads philosophy") — unified `Part` with `text` member |
| Message + data `Part` | Orchestrator → Portfolio (raw holdings JSON), Orchestrator → Tax (standardized lots) — unified `Part` with `data` member |
| `SendMessage` (sync) | Portfolio Agent — responds inline with completed Task (`returnImmediately: false`) |
| `SendStreamingMessage` (SSE) | Strategy Agent — emits `taskStatusUpdate` and `taskArtifactUpdate` events (member-name discrimination; no `kind` field). Client consumes them as `StreamResponse` via `payload.$case` |
| Task lifecycle | Tax Agent — `submitted → working → input-required → working → completed`, plus a `failed` path |
| `GetTask` polling | Orchestrator polls Tax Agent on an interval |
| `input-required` | Tax Agent asks for a missing purchase date; Orchestrator relays to user and continues the **same taskId** with a follow-up message |
| `SubscribeToTask` | Orchestrator reattaches SSE after a simulated disconnect (v1.0 also allows multiple concurrent subscriptions) |
| `CancelTask` | CLI command to abort a running Tax task |
| `ListTasks` | New in v1.0 — backs the Orchestrator's `/tasks` CLI command against each server (paginated) |
| Artifacts | Portfolio → `standardized-holdings` artifact; Tax → `execution-plan` artifact; Strategy → `target-allocation` artifact |
| contextId | One conversation groups all three tasks under a shared `contextId` |
| Errors | Portfolio throws `RequestMalformedError` (`@a2a-js/sdk/errors`) on Zod failure — maps to JSON-RPC `-32602` on the wire; unknown method → `-32601` per the spec's error-code mappings |
| Version negotiation | SDK sends `A2A-Version: 1.0` on every request; servers reject mismatches (`VersionNotSupportedError`) |

---

## 3. Agent Cards

Served at `GET /.well-known/agent-card.json` on each server. Representative card (Tax Agent), v1.0 structure — note `supportedInterfaces` replaces the old top-level `url`/`preferredTransport`/`protocolVersion`:

```json
{
  "name": "Tax Agent",
  "description": "Lot-level tax-loss harvesting and asset-location optimizer",
  "version": "1.0.0",
  "supportedInterfaces": [
    {
      "url": "http://localhost:4003/a2a",
      "protocolBinding": "JSONRPC",
      "protocolVersion": "1.0"
    }
  ],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "extendedAgentCard": false
  },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    {
      "id": "optimize-tax",
      "name": "Tax Optimization",
      "description": "Given standardized lots (portfolio-v1 schema), produce a wash-sale-safe execution plan",
      "tags": ["tax", "harvesting", "asset-location"],
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ]
}
```

Card differences across agents:

- **Portfolio** (`:4001`): `capabilities.streaming: false` — forces the Orchestrator to handle a non-streaming peer. Skill `standardize-holdings`, inputModes `["application/json", "text/plain"]` (accepts messy pasted data as a text `Part` too).
- **Strategy** (`:4002`): `streaming: true`. Skill `derive-allocation`, input primarily a text `Part` (a philosophy), output a data `Part`.
- **Tax** (`:4003`): `streaming: true`. Card is the one the Orchestrator inspects for schema compatibility (`portfolio-v1`) before delegating — the discovery/verification step from `design.md §III.1`.

**Orchestrator startup routine:** fetch all three cards → validate each `supportedInterfaces[].protocolVersion` → index skills by tag → refuse to route to an agent whose card is unreachable (teaches graceful degradation). The SDK's `ClientFactory.createFromAgentCard()` picks the matching interface automatically.

---

## 4. Data contracts (Zod schemas, shared package)

All three servers and the client import from a shared `packages/schemas` workspace so the "boundary enforcer" role of Zod (design.md §IV) is a single source of truth.

**`portfolio-v1` (output of Portfolio, input to Tax and Strategy):**

```
Holding {
  accountId: string
  accountType: "taxable" | "traditional-ira" | "roth-ira" | "401k"
  symbol: string
  lots: Lot[]
}
Lot {
  lotId: string
  quantity: number (positive)
  costBasis: number (per share)
  purchaseDate: ISO date | null   // null triggers input-required downstream
}
Portfolio {
  portfolioId: string
  asOf: ISO datetime
  holdings: Holding[]
  uninvestedCash: { accountId: string, amount: number }[]
}
```

**`allocation-v1` (output of Strategy):** `{ philosophy: string, targets: { assetClass, weightPct, preferredVehicles: string[] }[] }`

**`execution-plan-v1` (output of Tax):** `{ actions: { type: "sell" | "buy" | "hold", accountId, symbol, lotId?, quantity, reason }[], estimatedTaxSavings: number, washSaleWarnings: string[] }`

---

## 5. Interaction flows

### Flow A — Sync request/response (Portfolio Agent)

```text
Orchestrator                          Portfolio Agent
     │  POST /a2a  SendMessage             │
     │  Message{ role:ROLE_USER, parts:[   │
     │    Part{ data: raw holdings } ] }   │
     │ ────────────────────────────────▶   │  Zod-parse → normalize
     │                                     │  categorize accounts, flag cash
     │  ◀──────────────────────────────    │
     │  Task{ status: completed,           │
     │    artifacts:[ standardized-        │
     │      holdings (data Part,           │
     │      portfolio-v1) ] }              │
```

Error branch: malformed input → `RequestMalformedError` (JSON-RPC `-32602` on the wire) with the Zod issue list in the error details. The Orchestrator surfaces this to the user instead of retrying blindly.

### Flow B — Streaming (Strategy Agent)

```text
Orchestrator                          Strategy Agent
     │  POST /a2a  SendStreamingMessage    │
     │  parts:[ Part{ text:"Bogleheads" }, │
     │          Part{ data: portfolio-v1 }]│
     │ ────────────────────────────────▶   │
     │  ◀── SSE: taskStatusUpdate(working, │
     │        "interpreting philosophy")   │
     │  ◀── SSE: taskStatusUpdate(working, │
     │        "computing target weights")  │
     │  ◀── SSE: taskArtifactUpdate        │
     │        (allocation-v1, index:0)     │
     │  ◀── SSE: taskStatusUpdate          │
     │        (completed) — terminal state │
     │        closes the stream (v1.0 has  │
     │        no `final` flag)             │
```

The client consumes these as `StreamResponse` objects, switching on `payload.$case` (`statusUpdate` / `artifactUpdate` / `task` / `message`). Research-Agent delegation from the full design is replaced by a hardcoded philosophy→allocation lookup table; the SSE plumbing is what we're learning here.

### Flow C — Long-running async task with multi-turn (Tax Agent)

```text
Orchestrator                               Tax Agent
     │ SendMessage (data Part: lots,            │
     │   returnImmediately: true)               │
     │ ─────────────────────────────────▶       │
     │ ◀─ Task{ id:T1, status: submitted }      │
     │                                          │ solver starts (simulated
     │ GetTask(T1)  … poll every 2s             │ delay to make async real)
     │ ◀─ Task{ status: working }               │
     │                                          │ finds lot with null purchaseDate
     │ ◀─ Task{ status: input-required,         │
     │      message: "Purchase date for         │
     │      lot VTI-003?" }                     │
     │                                          │
     │ (Orchestrator asks the user, then        │
     │  continues the SAME task)                │
     │ SendMessage { taskId: T1,                │
     │   parts:[ Part{ data:{lotId,date} } ] }  │
     │ ─────────────────────────────────▶       │
     │ ◀─ Task{ status: working }               │
     │ GetTask(T1)                              │
     │ ◀─ Task{ status: completed,              │
     │     artifacts:[ execution-plan-v1 ] }    │
```

Also designed in: `SubscribeToTask(T1)` to reattach a dropped SSE stream, and `CancelTask(T1)` → terminal `canceled` state. Wash-sale check failure → `failed` with error message — so all terminal states are reachable in demos.

### End-to-end pipeline

One `contextId` spans the conversation: user pastes holdings → Flow A → user states philosophy → Flow B → Flow C → Orchestrator renders the execution-plan artifact. The Orchestrator's `@openai/agents` loop decides sequencing; each remote agent is wrapped as a tool whose implementation is an A2A client call (the "LLM plans, protocol transports" split).

---

## 6. Orchestrator internals

- **Runtime:** Node.js (>= 20) CLI (readline loop), `@openai/agents` with `gpt-5.4-mini`, in-process `MemorySession` per run.
- **A2A client layer:** one `Client` per remote agent, created via `ClientFactory.createFromUrl()` at startup (the factory fetches the card and selects the JSONRPC interface). No JSON-RPC envelopes in app code — the v1.0 SDK returns unwrapped domain objects (`Message | Task`).
- **Tool surface exposed to the LLM:** `standardize_portfolio`, `derive_allocation`, `optimize_taxes` — each a thin wrapper over the SDK client calls to the matching skill found via agent-card discovery. The LLM never sees JSON-RPC; it sees tools.
- **Task registry:** in-memory map `taskId → { agentUrl, contextId, status, lastEvent }` driving a `/tasks` CLI command that prints live task states (cross-checked against each server's `ListTasks`) — the observability hook for learning the lifecycle.
- **input-required bridge:** when any task pauses, the Orchestrator injects the agent's question into the user conversation and routes the answer back with the original `taskId` + `contextId`.
- **No-LLM mode:** a `--scripted` flag runs the same pipeline with hardcoded routing, so A2A mechanics can be studied without an OpenAI key (per the mock-everything decision).

## 7. Server internals (common shape)

Each server: `@hapi/hapi` host → `@a2a-js/sdk` v1.0 `DefaultRequestHandler` → an `AgentExecutor` implementing the skill. Executors read the incoming request via `RequestContext` (`ctx.userMessage`, `ctx.request.configuration`) and publish lifecycle events through the `ExecutionEventBus` using `AgentEvent` factories (`AgentEvent.task(...)`, `AgentEvent.statusUpdate(...)`, `AgentEvent.artifactUpdate(...)`). Failures are raised as semantic error classes from `@a2a-js/sdk/errors` (`RequestMalformedError`, `TaskNotFoundError`, `TaskNotCancelableError`). Shared middleware: Winston request logging, Zod validation at the boundary, OpenTelemetry HTTP instrumentation. All business logic is deterministic (no LLM inside servers) so agent behavior is reproducible while learning the protocol. Tax solver is a simplified greedy harvester (sell lots with losses in taxable accounts, respect 30-day wash-sale window against planned buys) — enough logic to make `input-required` and `failed` states meaningful.

## 8. Observability (kept from full design)

- OpenTelemetry SDK in all four processes; W3C trace context propagates through A2A HTTP calls, so one trace covers user request → orchestrator → agent → artifact.
- Langfuse via `@langfuse/otel` on the Orchestrator only (token/latency for the LLM loop). Optional; off in `--scripted` mode.
- Winston JSON logs per process, tagged with `taskId`/`contextId` for cross-process correlation.

## 9. Project layout

```text
portfolio/
  packages/
    schemas/          # shared Zod schemas + JSON-schema exports for agent cards
    a2a-common/       # server bootstrap, telemetry, logging helpers
  apps/
    orchestrator/     # A2A client + @openai/agents CLI
    portfolio-agent/  # :4001
    strategy-agent/   # :4002
    tax-agent/        # :4003
  demos/              # scripted walkthroughs, one per A2A concept
  .env.example        # OPENAI_API_KEY (optional), ports, LANGFUSE_* (optional)
```

npm workspaces, Vitest per package. `demos/` is the learning path: `01-discovery`, `02-sync-message`, `03-streaming`, `04-task-lifecycle`, `05-input-required`, `06-cancel-resubscribe`, `07-end-to-end`.

## 10. Build order (when we start coding)

1. `packages/schemas` + agent cards (static, v1.0 `supportedInterfaces` shape) — discovery works with `curl`
2. Portfolio Agent + minimal client script — Flow A
3. Strategy Agent — Flow B (SSE)
4. Tax Agent — Flow C (lifecycle, input-required, cancel)
5. Orchestrator CLI with `--scripted` mode — end-to-end without keys
6. `@openai/agents` routing layer — plug in OpenAI key
7. Telemetry + Langfuse, then extend toward the full `design.md` topology (Risk Agent, Research sub-tree)

## 11. Deliberately deferred (vs full design)

Risk Agent, Research sub-orchestrator and data agents (Market/ETF/Company/Economic), external APIs (Finnhub, FMP, FRED), push notifications (webhook callbacks — worth adding in step 7 as the last untaught A2A capability; note the v1.0 method names `CreateTaskPushNotificationConfig` etc.), authenticated agent cards / security schemes / JWS card signatures, multi-tenancy (`tenant` on requests and interfaces), and the v0.3 compatibility layer (`@a2a-js/sdk/compat/v0_3`) since all peers here are v1.0-native.
