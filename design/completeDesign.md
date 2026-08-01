# A2A Portfolio Tax Optimizer — Complete Design

The full system from `design.md`, specified at the same level of detail as `a2a-learning-slice.md`. Ten agents across ten processes: one top-level A2A Client (Orchestrator), one mid-tier sub-orchestrator that is both A2A Server *and* A2A Client (Research), and eight A2A Servers. This is a strict superset of the learning slice — everything built there carries forward unchanged; the Risk Agent, the Research sub-tree, external data APIs, push notifications, and secured agent cards are added on top.

Built on `@a2a-js/sdk` **v1.0.0**, which implements the **A2A Protocol Specification v1.0** (Node.js >= 20 required). Clients use `ClientFactory`/`Client`; servers implement `AgentExecutor`s behind a `DefaultRequestHandler`; errors come from the `@a2a-js/sdk/errors` taxonomy. All requests carry the `A2A-Version: 1.0` header.

> **Notation:** task states appear in short form in diagrams (`working`, `input-required`, …) for readability; on the wire v1.0 serializes them as `SCREAMING_SNAKE_CASE` (`TASK_STATE_WORKING`, `TASK_STATE_INPUT_REQUIRED`, …) via the SDK's `TaskState` enum. `role` is `ROLE_USER` / `ROLE_AGENT`. "text Part" / "data Part" refer to v1.0's unified `Part` type discriminated by which content member is present (`text`, `data`, `url`, `raw`).

---

## 1. Topology

```text
                          ┌──────────────────────┐
                          │      User Input      │
                          └──────────┬───────────┘
                                     ▼
     ┌────────────────────────────────────────────────────────────────┐
     │              WEALTH ORCHESTRATOR (A2A Client)                  │
     │   @openai/agents · gpt-5.4-mini · MemorySession · CLI          │
     │   @a2a-js/sdk v1.0 client · http://localhost:3000              │
     └──────┬───────────────┬───────────────┬───────────────┬─────────┘
            │ JSON-RPC 2.0  │ JSON-RPC 2.0  │ JSON-RPC 2.0  │ JSON-RPC 2.0
            ▼               ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ PORTFOLIO  │  │  STRATEGY  │  │    TAX     │  │    RISK    │
     │   :4001    │  │   :4002    │  │   :4003    │  │   :4004    │
     │ sync msgs  │  │ SSE stream │  │ async task │  │ sync msgs  │
     └────────────┘  └─────┬──────┘  └────────────┘  └────────────┘
                           │ JSON-RPC 2.0 (Strategy acts as A2A Client here)
                           ▼
                    ┌──────────────────────────────┐
                    │   RESEARCH AGENT   :4005     │
                    │   A2A Server + A2A Client    │
                    │   (sub-orchestrator, fan-out │
                    │    with push notifications)  │
                    └───┬──────────┬───────────┬───┘
                        │          │           │  parallel JSON-RPC 2.0
            ┌───────────┘          │           └───────────┐
            ▼                      ▼                       ▼
     ┌────────────┐         ┌────────────┐          ┌────────────┐
     │   MARKET   │         │    ETF     │          │  COMPANY   │
     │   :4101    │         │   :4102    │          │   :4103    │
     │ SSE stream │         │ sync msgs  │          │ sync msgs  │
     └─────┬──────┘         └─────┬──────┘          └─────┬──────┘
           │ JSON-RPC 2.0         │                       │
           ▼                      ▼                       ▼
     ┌────────────┐             FMP                      FMP
     │  ECONOMIC  │      (MARKET wraps Finnhub for quotes/indicators)
     │   :4104    │
     │ sync msgs  │
     └─────┬──────┘
           │
           ▼
        FRED API

 ────────────────────────────────────────────────────────────────────
  OBSERVABILITY: @opentelemetry/sdk-node (all 10 processes),
                 @langfuse/otel (Orchestrator + Research LLM-free spans)
  INFRASTRUCTURE: @hapi/hapi, Zod (packages/schemas), Winston, Vitest
  RUNTIME: Node.js >= 20 (required by @a2a-js/sdk v1.0)
 ────────────────────────────────────────────────────────────────────
```

| Process | Port | A2A role | Primary A2A pattern |
| --- | --- | --- | --- |
| Orchestrator | 3000 | Client | Discovery, routing, task correlation, `input-required` bridging |
| Portfolio Agent | 4001 | Server | Synchronous `SendMessage`, data Part → Artifact, schema rejection |
| Strategy Agent | 4002 | Server **and** Client | `SendStreamingMessage` (SSE) upstream; delegates downstream to Research |
| Tax Agent | 4003 | Server | Long-running async Task: `GetTask` polling, `input-required`, `SubscribeToTask`, `CancelTask` |
| Risk Agent | 4004 | Server | Synchronous validation gate; approve / reject-with-reasons |
| Research Agent | 4005 | Server **and** Client | Sub-orchestration: parallel fan-out, aggregation, **push notifications** |
| Market Agent | 4101 | Server **and** Client | SSE streaming of quotes/indicators; delegates macro to Economic |
| ETF Agent | 4102 | Server | Sync request/response wrapping FMP |
| Company Agent | 4103 | Server | Sync request/response wrapping FMP |
| Economic Agent | 4104 | Server | Sync request/response wrapping FRED, aggressive caching |

---

## 2. Concept coverage matrix

Everything from the learning slice, plus the concepts it deferred:

| A2A v1.0 concept | Where it's exercised |
| --- | --- |
| Agent Card / discovery | All nine servers expose `/.well-known/agent-card.json`; Orchestrator indexes the top tier at startup; Research indexes the data tier; Market discovers Economic |
| `supportedInterfaces` | Every card declares a JSONRPC interface with per-interface `protocolVersion: "1.0"`; clients validate version per interface |
| Skills | Every card declares 1–2 skills with `inputModes`/`outputModes` and tags used for routing |
| Message + text `Part` | Orchestrator → Strategy (philosophy), Research → data agents (query context) |
| Message + data `Part` | Holdings, lots, allocations, research briefs — all structured payloads |
| `SendMessage` (sync) | Portfolio, Risk, ETF, Company, Economic |
| `SendStreamingMessage` (SSE) | Strategy (to Orchestrator), Market (to Research) — `taskStatusUpdate`/`taskArtifactUpdate` events, consumed as `StreamResponse` via `payload.$case` |
| Task lifecycle | Tax: `submitted → working → input-required → working → completed`, plus `failed` and `canceled`; Research: long-running aggregation task |
| `GetTask` polling | Orchestrator ↔ Tax; Strategy ↔ Research (fallback when webhooks unavailable) |
| `ListTasks` | New v1.0 operation backing the Orchestrator's `/tasks` tree view (cursor-paginated) |
| `input-required` | Tax (missing purchase date) relayed two hops: Tax → Orchestrator → user |
| `SubscribeToTask` | Orchestrator reattaches to Tax and Strategy streams after disconnect; v1.0 allows multiple concurrent subscriptions per task |
| `CancelTask` | Cancellation **propagates**: cancel Strategy → Strategy cancels its Research task → Research cancels in-flight data-agent tasks |
| **Push notifications** | Research registers a webhook with `CreateTaskPushNotificationConfig` on slow data-agent tasks; data agents POST signed `StreamResponse`-format callbacks instead of being polled |
| Artifacts | Every server yields a typed artifact (see §4); Risk yields either an approval or an annotated rejection; streamed artifacts carry `index` |
| contextId | One user conversation = one `contextId`, propagated through **all** hops including the Research fan-out |
| referenceTaskIds | Risk Agent's task references the Tax and Strategy task IDs it is validating |
| Errors | `RequestMalformedError` on Zod failure everywhere (JSON-RPC `-32602` on the wire); unknown method → `-32601`; upstream API outages mapped to task `failed` with retry metadata, per the spec's error-code mappings |
| **Secured agent cards** | Data-tier cards declare `securitySchemes` (API-key header); Research attaches credentials per card declaration |
| Extended agent card | Tax Agent sets `capabilities.extendedAgentCard: true` and serves solver limits via `GetExtendedAgentCard` (authenticated) |
| Version negotiation | `A2A-Version: 1.0` on every request; mismatch → `VersionNotSupportedError` |
| Card signatures | Top-tier cards signed with JWS (`generateAgentCardSignature`); clients verify before trusting a card (see §11) |

---

## 3. Agent Cards

Served at `GET /.well-known/agent-card.json` on each server. Representative card (Research Agent — the most capable node), v1.0 structure:

```json
{
  "name": "Research Agent",
  "description": "Sub-orchestrator: turns an allocation question into an aggregated research brief by delegating to Market, ETF, and Company agents",
  "version": "1.0.0",
  "supportedInterfaces": [
    {
      "url": "http://localhost:4005/a2a",
      "protocolBinding": "JSONRPC",
      "protocolVersion": "1.0"
    }
  ],
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "extendedAgentCard": false
  },
  "defaultInputModes": ["application/json", "text/plain"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    {
      "id": "research-vehicles",
      "name": "Vehicle Research",
      "description": "Given target asset classes (allocation-v1 targets), return ranked candidate vehicles with fundamentals, costs, and macro context (research-brief-v1)",
      "tags": ["research", "etf", "equities", "macro"],
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ]
}
```

Card notes per agent:

- **Portfolio** (`:4001`): `streaming: false`. Skill `standardize-holdings`; inputModes `["application/json", "text/plain"]` — accepts messy pasted data as a text `Part`.
- **Strategy** (`:4002`): `streaming: true`. Skill `derive-allocation`; input text `Part` (philosophy) + data `Part` (portfolio-v1); output `allocation-v1`.
- **Tax** (`:4003`): `streaming: true`; `capabilities.extendedAgentCard: true` — serves an **extended card** via the authenticated `GetExtendedAgentCard` operation exposing solver constraints. Skill `optimize-tax`, input `portfolio-v1` + `allocation-v1`, output `execution-plan-v1`.
- **Risk** (`:4004`): `streaming: false`. Skill `validate-plan`; input `execution-plan-v1` + `portfolio-v1`; output `risk-report-v1`. Card advertises tag `gate` — the Orchestrator treats any `gate`-tagged agent as mandatory before presenting results to the user.
- **Research** (`:4005`): only card with `pushNotifications: true` in the top tier; both a server card (above) and an internal client that consumes the data-tier cards.
- **Market** (`:4101`): `streaming: true`. Skills `market-snapshot` and `macro-context` (the latter internally delegates to Economic). `securitySchemes: { apiKey: { in: "header", name: "X-Data-Key" } }`.
- **ETF** (`:4102`): `streaming: false`. Skill `profile-etfs` (expense ratios, AUM, tracking error via FMP). Same `securitySchemes`.
- **Company** (`:4103`): `streaming: false`. Skill `fundamentals` (valuation, margins, growth via FMP). Same `securitySchemes`.
- **Economic** (`:4104`): `streaming: false`. Skill `macro-indicators` (yield curve, CPI, unemployment via FRED). Declares `defaultOutputModes` with an explicit staleness field — responses carry `asOf` since FRED data is periodic.

**Discovery routine per client node** (all via `ClientFactory`, which fetches the card and binds the matching interface):

- Orchestrator (startup): fetch cards for `:4001–:4004` → verify JWS signature where present → validate each interface's `protocolVersion` → index skills by tag → refuse to route to unreachable agents.
- Strategy (lazy, first use): fetch Research's card; verify `research-vehicles` skill accepts `allocation-v1` targets.
- Research (startup): fetch cards for `:4101–:4103`; read each card's `securitySchemes` and bind the right credential.
- Market (lazy): fetch Economic's card before first macro delegation.

---

## 4. Data contracts (Zod schemas, shared package)

All processes import from `packages/schemas`. Schemas carried over from the slice: **`portfolio-v1`**, **`allocation-v1`**, **`execution-plan-v1`** (unchanged — see `a2a-learning-slice.md §4`). New contracts:

**`research-request-v1` (Strategy → Research):**

```
ResearchRequest {
  targets: { assetClass: string, weightPct: number }[]
  philosophy: string                 // free-text context, becomes text-Part hints
  constraints: {
    maxExpenseRatioPct?: number
    excludeSectors?: string[]        // e.g. ESG screens
    preferredDomiciles?: string[]
  }
}
```

**`market-snapshot-v1` (Market → Research):**

```
MarketSnapshot {
  asOf: ISO datetime
  quotes: { symbol, price, changePct, volume }[]
  regime: { trend: "bull" | "bear" | "sideways", volatilityPercentile: number }
  macro?: EconomicIndicators         // embedded from Economic Agent
}
```

**`etf-profile-v1` (ETF → Research):** `{ profiles: { symbol, name, assetClass, expenseRatioPct, aum, trackingErrorPct, topHoldings: string[] }[] }`

**`company-fundamentals-v1` (Company → Research):** `{ companies: { symbol, marketCap, peRatio, dividendYieldPct, revenueGrowthPct, debtToEquity, sector }[] }`

**`economic-indicators-v1` (Economic → Market):** `{ asOf, yieldCurve: { spread2y10y, inverted: boolean }, cpiYoYPct, unemploymentPct, fedFundsRatePct, recessionSignal: "low" | "elevated" | "high" }`

**`research-brief-v1` (Research → Strategy):**

```
ResearchBrief {
  perAssetClass: {
    assetClass: string
    rankedVehicles: {
      symbol: string
      kind: "etf" | "stock"
      score: number                  // deterministic composite of cost/quality/fit
      rationale: string
    }[]
  }[]
  marketContext: MarketSnapshot      // regime + macro used in scoring
  sources: { agent: string, taskId: string }[]   // provenance for tracing
}
```

**`risk-report-v1` (Risk → Orchestrator):**

```
RiskReport {
  verdict: "approved" | "rejected"
  portfolioBeta: number
  sectorConcentration: { sector, weightPct }[]   // flag any > 25%
  maxDrawdownEstimatePct: number
  violations: { rule: string, detail: string, blocking: boolean }[]
  referencedTasks: string[]          // Tax + Strategy task IDs validated
}
```

`allocation-v1.targets[].preferredVehicles` is no longer a hardcoded lookup (as in the slice) — it is populated from `research-brief-v1.rankedVehicles`.

---

## 5. Interaction flows

Flows A (Portfolio, sync), B (Strategy, SSE), and C (Tax, async multi-turn) are identical to `a2a-learning-slice.md §5` and are not repeated. New and changed flows:

### Flow B′ — Strategy with live Research delegation (replaces the stubbed lookup)

```text
Orchestrator                Strategy Agent                 Research Agent
     │ SendStreamingMessage      │                              │
     │ ─────────────────────▶    │                              │
     │ ◀─ SSE: taskStatusUpdate  │                              │
     │    (working, "interpreting│                              │
     │     philosophy")          │                              │
     │                           │ SendMessage                  │
     │                           │ (research-request-v1,        │
     │                           │  returnImmediately: true)    │
     │                           │ ─────────────────────▶       │
     │                           │ ◀─ Task{ id:R1, submitted }  │
     │ ◀─ SSE: taskStatusUpdate  │                              │
     │    (working, "researching │  GetTask(R1) or webhook      │
     │     vehicles…")           │  (see Flow D)                │
     │                           │ ◀─ Task{ R1 completed,       │
     │                           │    artifacts:[research-      │
     │                           │    brief-v1] }               │
     │ ◀─ SSE: taskArtifactUpdate│                              │
     │    (allocation-v1 with    │  merge brief into targets    │
     │     real vehicles)        │                              │
     │ ◀─ SSE: taskStatusUpdate  │                              │
     │    (completed) — terminal │                              │
     │    state closes stream ──x│                              │
```

If Research is unreachable, Strategy degrades to the slice's lookup table and stamps the artifact `metadata.degraded: true` — the Orchestrator tells the user vehicle selection was heuristic.

### Flow D — Research fan-out with push notifications (the sub-orchestration pattern)

```text
Strategy            Research Agent          Market :4101   ETF :4102   Company :4103
   │ send req            │                       │             │            │
   │ ───────▶            │  (parallel dispatch, one task per data agent)   │
   │                     │ SendStreamingMessage ▶│             │            │
   │                     │ SendMessage ──────────────────────▶ │            │
   │                     │ SendMessage ──────────────────────────────────▶  │
   │                     │                       │             │            │
   │                     │ CreateTaskPushNotificationConfig(   │            │
   │                     │   M1, url: :4005/webhooks/a2a) ────▶│            │
   │                     │                       │             │            │
   │                     │ ◀─ ETF: completed inline (sync, etf-profile-v1) │
   │                     │ ◀─ Company: completed inline (company-fund.-v1) │
   │                     │ ◀─ SSE: Market taskStatusUpdates…   │            │
   │                     │        (Market ⇄ Economic happens   │            │
   │                     │         here — see Flow E)          │            │
   │                     │ ◀─ POST /webhooks/a2a (signed,      │            │
   │                     │    StreamResponse format):          │            │
   │                     │    Task{ M1 completed,              │            │
   │                     │      market-snapshot-v1 }           │            │
   │                     │                                     │            │
   │                     │  score & rank vehicles (deterministic composite) │
   │ ◀─ Task completed,  │                                     │            │
   │   research-brief-v1 │                                     │            │
```

- **Partial failure policy:** if one data agent fails or times out (10 s budget each), Research completes anyway with that section marked `sources: [...missing]` and lowers scores' confidence; if **all** fail, Research's task → `failed`.
- **Cancellation propagation:** `CancelTask` on Research's task cancels every child task it spawned before returning `canceled`.
- **Webhook security:** callbacks are HMAC-signed with a shared secret from the push-notification config (v1.0 `AuthenticationInfo.scheme`); Research rejects unsigned or replayed callbacks (timestamp + nonce).

### Flow E — Market → Economic delegation (nested sync hop)

```text
Research              Market Agent              Economic Agent
   │ SendStreamingMessage  │                         │
   │ ──────────────▶       │                         │
   │ ◀─ SSE: taskStatus-   │  SendMessage            │
   │    Update(working,    │  (skill macro-          │
   │    "fetching quotes") │   indicators) ────────▶ │  FRED fetch or
   │                       │                         │  cache hit (TTL 24h)
   │                       │ ◀─ completed inline,    │
   │                       │   economic-indicators-v1│
   │ ◀─ SSE: taskArtifact- │  embed into snapshot    │
   │   Update(market-      │                         │
   │   snapshot-v1)        │                         │
```

Economic is the simplest server in the mesh — a cached pass-through — which makes it the canonical example of wrapping a plain REST API as an A2A skill.

### Flow F — Risk validation gate (new, final hop before the user)

```text
Orchestrator                              Risk Agent
     │ SendMessage                             │
     │ parts:[ Part{ data: execution-plan-v1 },│
     │         Part{ data: portfolio-v1 } ]    │
     │ referenceTaskIds: [T1(tax), S1(strat)]  │
     │ ─────────────────────────────────▶      │  compute beta, sector
     │                                         │  concentration, drawdown
     │ ◀─ Task{ completed,                     │  estimate vs. thresholds
     │    artifacts:[ risk-report-v1 ] }       │
```

- `verdict: approved` → Orchestrator renders the execution plan to the user with the risk summary attached.
- `verdict: rejected` with blocking violations → Orchestrator loops: it feeds the violations back to the Tax Agent as a **new message on the same Tax taskId is not possible (task is terminal)**, so it opens a fresh Tax task carrying `referenceTaskIds: [T1]` and the violation list as a data-Part constraint. Max 2 remediation loops, then surface to the user for a decision.

### End-to-end pipeline

One `contextId` spans everything:

1. User pastes holdings → **Flow A** (Portfolio) → `portfolio-v1` artifact.
2. User states philosophy → **Flow B′** (Strategy) which internally runs **Flow D** (Research fan-out) and **Flow E** (Market→Economic) → `allocation-v1` with researched vehicles.
3. **Flow C** (Tax) with portfolio + allocation → `execution-plan-v1`, pausing on `input-required` if lots lack purchase dates.
4. **Flow F** (Risk) gates the plan → approved plan + `risk-report-v1` rendered to the user.

The Orchestrator's `@openai/agents` loop decides sequencing; every remote agent is a tool whose implementation is an A2A client call. The LLM plans; the protocol transports. Research's fan-out is invisible to the Orchestrator — sub-orchestration is encapsulated behind one skill, which is the architectural point of the mid-tier.

---

## 6. Orchestrator internals

Carried over from the slice, with additions:

- **A2A client layer:** one `Client` per top-tier agent via `ClientFactory` (fetches cards, verifies signatures, binds the JSONRPC interface). App code sees unwrapped `Message | Task` objects and `StreamResponse` generators — no JSON-RPC envelopes.
- **Tool surface:** `standardize_portfolio`, `derive_allocation`, `optimize_taxes`, plus new `validate_risk`. Research is *not* a tool — the LLM never routes to it directly; Strategy owns that delegation.
- **Gate enforcement:** the agent loop's system prompt plus a hard post-condition in code: no execution plan is shown to the user without an `approved` risk-report artifact in the same `contextId`. Defense in depth against LLM skipping the gate.
- **Task registry:** `taskId → { agentUrl, contextId, status, lastEvent, parentTaskId? }`; the `/tasks` CLI command now renders the task **tree** (Research children appear indented under Strategy when webhook events are traced through), reconciled against each server's `ListTasks`.
- **Remediation loop state:** counts Risk rejections per `contextId`; after 2, stops and presents violations to the user.
- **input-required bridge** and **`--scripted` no-LLM mode**: unchanged from the slice.

## 7. Research Agent internals (sub-orchestrator)

The one genuinely new component class:

- **Dual role:** `@hapi/hapi` server hosting the `research-vehicles` skill, plus an embedded pool of SDK `Client`s, one per data agent.
- **Fan-out executor:** dispatches all three data-agent calls concurrently (`Promise.allSettled` semantics — settle everything, never fail fast), each with its own timeout budget and per-agent circuit breaker (3 consecutive failures → skip agent, mark degraded, retry after cool-down).
- **Webhook receiver:** `POST /webhooks/a2a` accepts v1.0 `StreamResponse`-format callbacks; validates HMAC signature, timestamp window, and nonce; resolves the pending child-task promise. Falls back to `GetTask` polling if a data agent's card lacks `pushNotifications`.
- **Scoring:** deterministic composite — cost (expense ratio), quality (tracking error / fundamentals), macro fit (regime + recession signal) — so ranked output is reproducible. **No LLM inside Research**; it is a coordinator, not a reasoner.
- **Provenance:** every brief lists the child `taskId`s in `sources[]`, tying the artifact to the OpenTelemetry trace.

## 8. Data agents internals (Market, ETF, Company, Economic)

Common shape: `@hapi/hapi` → `@a2a-js/sdk` v1.0 `DefaultRequestHandler` → `AgentExecutor` wrapping one external API client.

- **Rate limiting & caching:** each agent owns its provider's rate budget (FMP's ~250 req/day free tier, shared by ETF and Company, is the binding constraint → both cache aggressively, TTL 24 h for profiles/fundamentals; Market's Finnhub budget is generous at 60 req/min, TTL 15 min for quotes; Economic caches FRED for 24 h). Cache is in-process LRU; a cache hit is still a full A2A task so behavior is uniform.
- **Upstream failure mapping:** provider 429/5xx → task `failed` with a machine-readable `retryAfter` in the error details; Research's circuit breaker consumes it.
- **Secrets:** provider API keys live only in the data-tier processes (`.env`); nothing upstream ever sees them. The `X-Data-Key` scheme on their agent cards authenticates *Research to them*, separate concern from provider keys.
- **Market Agent** is the only data agent that is also a client (→ Economic) and the only streaming one — its SSE `taskStatusUpdate`s narrate fetch progress so Research (and traces) show where time is spent.

## 9. Server internals (common shape)

Unchanged in spirit from the slice, on the v1.0 SDK surface: `@hapi/hapi` host → `DefaultRequestHandler` → `AgentExecutor` per skill. Executors read requests via `RequestContext` (`ctx.userMessage`, `ctx.request.configuration`) and publish through the `ExecutionEventBus` using `AgentEvent` factories (`AgentEvent.task`, `AgentEvent.statusUpdate`, `AgentEvent.artifactUpdate`); failures raise semantic classes from `@a2a-js/sdk/errors`. Winston request logging, Zod validation at every boundary (inbound Parts and outbound Artifacts), OpenTelemetry HTTP instrumentation. All business logic deterministic — the **only LLM in the entire system lives in the Orchestrator**. Tax solver upgraded from the slice's greedy harvester to a small linear-programming pass (lot selection + asset location jointly), which is what makes its long-running async lifecycle real rather than simulated.

## 10. Observability

- **OpenTelemetry** in all ten processes; W3C trace context propagates through every A2A HTTP call *and* through webhook callbacks (traceparent echoed in the push-notification POST), so a single trace covers: user request → Orchestrator → Strategy → Research → {Market → Economic, ETF, Company} → back up → Tax → Risk.
- **Langfuse** (`@langfuse/otel`) on the Orchestrator for LLM token/latency; optional, off in `--scripted` mode.
- **Winston** JSON logs per process tagged with `taskId`/`contextId`/`parentTaskId` for cross-process correlation; A2A faults (`RequestMalformedError`, `TaskNotFoundError`, …) logged at the mesh edge where they occur with their wire-level JSON-RPC code.
- **`/tasks` CLI tree view** (see §6) as the human-readable window into the distributed lifecycle.

## 11. Security model

- **Agent card `securitySchemes`:** data-tier agents require `X-Data-Key`; Research reads the scheme from each card and attaches the credential. Top-tier agents are open on localhost in dev; the scheme slot is where OAuth2/bearer goes when deployed — note v1.0 removed the implicit and password OAuth flows and added Device Code (RFC 8628) and `pkceRequired` on the authorization-code flow.
- **Agent card signatures (new in v1.0):** top-tier cards are JWS-signed (`generateAgentCardSignature` / `verifyAgentCardSignature`, RFC 7515 + RFC 8785 canonicalization); the Orchestrator verifies signatures at discovery before trusting a card.
- **Extended agent card:** Tax advertises `capabilities.extendedAgentCard: true` and serves solver limits (max lots, supported account types) only via the authenticated `GetExtendedAgentCard` operation — demonstrates public vs. privileged capability disclosure.
- **Webhook hardening:** HMAC signature + timestamp window + nonce replay protection on Research's callback endpoint (§7).
- **Data hygiene:** portfolio data travels only as Zod-validated data Parts; no raw user financials in text Parts; provider API keys confined to the data tier.

## 12. Project layout

```text
portfolio/
  packages/
    schemas/            # all v1 contracts (§4) + JSON-schema exports for cards
    a2a-common/         # server bootstrap, telemetry, logging, webhook signing
  apps/
    orchestrator/       # A2A client + @openai/agents CLI          :3000
    portfolio-agent/    #                                          :4001
    strategy-agent/     # server + client to research              :4002
    tax-agent/          # LP solver, extended card                 :4003
    risk-agent/         # validation gate                          :4004
    research-agent/     # sub-orchestrator, webhook receiver       :4005
    market-agent/       # Finnhub + client to economic             :4101
    etf-agent/          # FMP                                      :4102
    company-agent/      # FMP                                      :4103
    economic-agent/     # FRED, 24h cache                          :4104
  demos/                # scripted walkthroughs, one per concept
  .env.example          # OPENAI_API_KEY, FINNHUB_KEY, FMP_KEY, FRED_KEY,
                        # DATA_TIER_KEY, WEBHOOK_SECRET, CARD_SIGNING_KEY,
                        # LANGFUSE_* (all optional except in the modes that
                        # use them)
```

npm workspaces, Vitest per package. `demos/` extends the slice's path: `01–07` unchanged, then `08-risk-gate`, `09-research-fanout`, `10-push-notifications`, `11-cancellation-propagation`, `12-secured-cards`, `13-full-pipeline`.

## 13. Build order

Steps 1–7 are the learning slice (already designed there). Continuing:

8. **Risk Agent** — simplest new server (sync, deterministic checks); wire the Orchestrator gate + remediation loop.
9. **Economic Agent** — smallest data agent; establishes the external-API wrapper pattern, caching, and failure mapping with FRED.
10. **ETF + Company Agents** — clone the wrapper pattern for FMP (sync, shared key/rate budget).
11. **Market Agent** — streaming data agent + its client hop to Economic (Flow E).
12. **Research Agent** — fan-out, aggregation, circuit breakers; polling first, then **push notifications** (webhook receiver + `CreateTaskPushNotificationConfig` + signing).
13. **Strategy upgrade** — swap the lookup stub for live Research delegation (Flow B′) with graceful degradation.
14. **Security pass** — data-tier `securitySchemes`, Tax extended card (`GetExtendedAgentCard`), JWS card signatures, webhook hardening.
15. **End-to-end** — full pipeline demo, trace review in Langfuse/OTel, load the mesh with concurrent contexts.

## 14. Failure & degradation matrix

| Failure | Behavior |
| --- | --- |
| A data agent down | Research completes degraded; brief marks missing `sources`; Strategy notes lower confidence |
| All data agents down | Research task `failed`; Strategy falls back to lookup table, artifact `metadata.degraded: true` |
| Research down | Strategy uses lookup table directly (slice behavior) |
| Tax `input-required` unanswered | Task idles; Orchestrator reminds user; `CancelTask` after CLI timeout command |
| Risk rejects twice | Remediation loop stops; violations presented to user for a manual call |
| Provider rate limit hit | Task `failed` with `retryAfter`; circuit breaker cools down; caches absorb repeat queries |
| Webhook lost | Research's per-child watchdog falls back to `GetTask` polling after 15 s of silence |
| Agent card unreachable at startup | Client refuses to route to that agent; Orchestrator reports which capabilities are offline |
| Card signature invalid | Orchestrator treats the agent as untrusted and refuses to route to it |
