Here is the complete architectural blueprint for your multi-agent portfolio tax optimizer. This design relies entirely on a distributed microservice model, mapping your requested agents to the **A2A (Agent2Agent) v1.0 Protocol** standard over JSON-RPC 2.0.

### I. System Architecture Diagram

In an A2A ecosystem, the architecture shifts from a local function-calling monolith to a network of independent servers communicating via standard HTTP interfaces. The Orchestrator acts as the central **A2A Client**, while specialized agents act as **A2A Servers**.

```text
                                  ┌────────────────────────┐
                                  │       User Input       │
                                  └───────────┬────────────┘
                                              │
 ┌────────────────────────────────────────────▼────────────────────────────────────────────┐
 │                            THE WEALTH ORCHESTRATOR AGENT                                │
 │                                  (A2A Client Node)                                      │
 │ Tech: @openai/agents | gpt-5.4-mini | In-Process Memory | @a2a-js/sdk v1.0.0 (Client)   │
 └──────┬────────────────────┬────────────────────┬────────────────────┬───────────────────┘
        │ A2A / JSON-RPC     │ A2A / JSON-RPC     │ A2A / JSON-RPC     │ A2A / JSON-RPC
        ▼                    ▼                    ▼                    ▼
 ┌──────┴───────┐    ┌───────┴────────┐   ┌───────┴────────┐   ┌───────┴────────┐
 │   PORTFOLIO  │    │    STRATEGY    │   │      TAX       │   │      RISK      │
 │     AGENT    │    │      AGENT     │   │     AGENT      │   │     AGENT      │
 │ (A2A Server) │    │  (A2A Server)  │   │  (A2A Server)  │   │  (A2A Server)  │
 └──────────────┘    └───────┬────────┘   └────────────────┘   └────────────────┘
                             │
                             │ A2A / JSON-RPC
                             ▼
                     ┌───────┴────────┐
                     │    RESEARCH    │
                     │     AGENT      │
                     │  (A2A Server)  │
                     └─┬─────┬──────┬─┘
                       │     │      │
          ┌────────────┘     │      └─────────────┐
          ▼                  ▼                    ▼
 ┌────────┴───────┐  ┌───────┴────────┐   ┌───────┴────────┐
 │     MARKET     │  │      ETF       │   │    COMPANY     │
 │     AGENT      │  │     AGENT      │   │     AGENT      │
 └────────┬───────┘  └───────┬────────┘   └───────┬────────┘
          │                  │                    │
          ▼                  ▼                    ▼
 ┌────────┴───────┐        FMP                   FMP
 │    ECONOMIC    │   (MARKET wraps Finnhub for quotes)
 │     AGENT      │
 └────────┬───────┘
          │
          ▼
       FRED API

 ─────────────────────────────────────────────────────────────────────────────────────────
  OBSERVABILITY LAYER: @opentelemetry/sdk-node (Traces) & @langfuse/otel (Agent/Tokens)
  INFRASTRUCTURE: @hapi/hapi (Servers), Zod (Validation), Winston (Logs), Vitest (Tests)
  RUNTIME: Node.js >= 20 (required by @a2a-js/sdk v1.0)
 ─────────────────────────────────────────────────────────────────────────────────────────

```

---

### II. The Agent Ecosystem

Each standalone agent runs on its own `@hapi/hapi` web server, decoupled from the Orchestrator, allowing them to be scaled, tested, and updated independently.

| Agent Identity | Node Type | Primary Role & Responsibilities |
| --- | --- | --- |
| **Orchestrator Agent** | A2A Client | The "brain" powered by `@openai/agents`. Maintains the `MemorySession` for the user, translates natural language into routing logic, and initiates A2A Tasks to downstream servers. |
| **Portfolio Agent** | A2A Server | Standardizes messy user data into Zod-validated schemas. Extracts cost bases, categorizes tax-deferred vs. taxable accounts, and flags uninvested cash. |
| **Strategy Agent** | A2A Server | Translates human-centric philosophies (e.g., "Bogleheads", "ESG") into mathematical target allocations. It delegates to the Research Agent to select the specific asset vehicles. |
| **Tax Agent** | A2A Server | A deterministic node executing a mathematical solver to optimize lot-level tax-loss harvesting and ideal cross-account asset location (avoiding wash sales). |
| **Risk Agent** | A2A Server | Evaluates the proposed execution plan before returning it to the user. Validates portfolio beta, sector concentration, and downside risk metrics. |
| **Research Agent** | A2A Sub-Orchestrator | Acts as a mid-tier coordinator. Receives tasks from the Strategy Agent and fans them out to specialized quantitative data agents. |
| **Market / ETF / Company** | Sub-Agents | Fetches and processes real-time API data. For example, the Market agent streams quotes via Finnhub, while the ETF and Company agents pull expense ratios and fundamentals via FMP. |
| **Economic Agent** | Sub-Agent | Called by the Market Agent to digest macroeconomic indicators (Yield Curve, Inflation) from the FRED API to inform macro-strategies. |

---

### III. Core A2A Protocol Implementation

To fully utilize the `@a2a-js/sdk` v1.0 protocol implementation, your microservices will rely on the following distinct interactions over standard JSON-RPC 2.0 endpoints. Clients are built with the SDK's `ClientFactory`/`Client` API; servers implement `AgentExecutor`s behind a `DefaultRequestHandler`. All requests carry the `A2A-Version: 1.0` header, which servers validate.

#### 1. Agent Cards & Discovery

Before the Orchestrator delegates a task, it must verify the remote agent's capabilities. Each `@hapi/hapi` server exposes a `.well-known/agent-card.json` file.

* **Purpose:** Declares the agent's identity, supported interfaces (`supportedInterfaces[]`, each with its own `url`, `protocolBinding`, and `protocolVersion: "1.0"`), input formats, and exact JSON schema requirements. In v1.0 the protocol version lives per-interface rather than at the card's top level, and cards can carry JWS `signatures` for verification.
* **Workflow:** The Orchestrator fetches the Tax Agent's card to verify it supports the `portfolio-v1` schema before sending the user's financial data.

#### 2. Messages & Parts

A2A data is structured into **Messages**, which contain one or multiple **Parts**. In v1.0 there is a single unified `Part` type — the separate `TextPart`/`DataPart`/`FilePart` types are gone. The content kind is discriminated by which member is present (`text`, `data`, `url`, or `raw`), with an accompanying `mediaType`. Because portfolio data is sensitive and structural, you must bypass raw text in favor of structured data payloads.

* **Text `Part`:** Used for general context (e.g., "Apply a dividend growth philosophy") — `{ text, mediaType: "text/plain" }`.
* **Data `Part`:** Used for passing strict, `zod`-validated JSON objects — `{ data, mediaType: "application/json" }`. The Orchestrator passes the categorized lot-level holdings array as a data `Part` to the Tax Agent.

#### 3. Tasks & State Management

Complex operations, like solving a large linear programming problem for tax optimization, take time. A2A handles this natively through asynchronous **Tasks**.

* **Lifecycle States:** `TASK_STATE_SUBMITTED` ➔ `TASK_STATE_WORKING` ➔ `TASK_STATE_INPUT_REQUIRED` (optional) ➔ `TASK_STATE_COMPLETED` (or `TASK_STATE_FAILED`). v1.0 serializes states in `SCREAMING_SNAKE_CASE`; the SDK exposes them as the `TaskState` enum.
* **Execution Flow:**
1. Orchestrator submits a Task to the Tax Agent via `SendMessage`.
2. Tax Agent immediately returns a `Task ID` with status `TASK_STATE_WORKING` (v1.0's `SendMessageConfiguration.returnImmediately` controls whether the call returns at once or blocks until terminal).
3. Orchestrator polls with `GetTask` or subscribes to Server-Sent Events via `SubscribeToTask` for that `Task ID`.
4. If the Tax Agent realizes data is missing (e.g., missing purchase date for a lot), it changes the state to `TASK_STATE_INPUT_REQUIRED`, prompting the Orchestrator to ask the user.



#### 4. Artifacts

When a Task reaches the `TASK_STATE_COMPLETED` state, it yields an **Artifact**. An artifact is a tangible deliverable rather than just a conversational response.

* **Usage:** The Portfolio Agent returns a structured `JSON Artifact` of the standardized holdings. The Tax Agent returns an `Execution Plan Artifact` detailing the exact shares to sell, the estimated tax savings, and the target asset locations.

---

### IV. Tech Stack Integration & Observability

Because multi-agent systems quickly become "black boxes," your configured stack provides deep observability across network borders.

* **OpenTelemetry (`@opentelemetry/sdk-node`):** Injects trace headers into the HTTP requests sent by `@a2a-js/sdk`. This allows you to track a single user request from the Orchestrator all the way down to the Economic Agent querying the FRED API.
* **Langfuse (`@langfuse/otel` & `@langfuse/tracing`):** Consumes the OpenTelemetry traces to construct visual Gantt charts of your agent executions. It specifically tracks the token usage and latency of `gpt-5.4-mini` within the Orchestrator's `@openai/agents` reasoning loop.
* **Winston:** Centralizes structural logging for the `@hapi/hapi` web servers, capturing A2A faults across the mesh via the SDK's v1.0 error taxonomy (`@a2a-js/sdk/errors` — e.g. `RequestMalformedError`, `TaskNotFoundError`, `UnsupportedOperationError`), which maps to standard JSON-RPC error codes on the wire.
* **Zod:** The critical boundary enforcer. Before an A2A Server accepts a data `Part` or yields an `Artifact`, Zod parses the schema to ensure no hallucinated properties enter the deterministic mathematical solvers.
