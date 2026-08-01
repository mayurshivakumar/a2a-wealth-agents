# A2A Wealth Agents

A multi-agent portfolio tax-loss-harvesting optimizer built on the **A2A (Agent2Agent) v1.0
protocol** over JSON-RPC 2.0, using `@a2a-js/sdk`. This repo currently implements **Slice 0** — the
four-process learning slice that exercises every core A2A v1.0 concept:

| Process         | Port    | Role                                             | A2A pattern it teaches                                                              |
| --------------- | ------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Orchestrator    | — (CLI) | A2A client, `@openai/agents` + `--scripted` mode | discovery, routing, task correlation, `input-required` bridging                     |
| Portfolio Agent | 4001    | A2A server                                       | synchronous `SendMessage`, artifact out, schema rejection                           |
| Strategy Agent  | 4002    | A2A server                                       | streaming send over SSE (status + artifact events)                                  |
| Tax Agent       | 4003    | A2A server                                       | long-running async task: polling, `input-required`, `SubscribeToTask`, `CancelTask` |

The only LLM in the system runs in the Orchestrator. Every server is deterministic. Everything is
in-memory — process restart = clean slate (a deliberate non-goal, not an oversight).

## Quickstart

Requires Node.js >= 20. No API keys are needed for the scripted flow, tests, or demos.

```bash
npm install

# Terminal 1 — start the three agent servers
npm run dev

# Terminal 2 — the Orchestrator CLI (scripted mode: keyword routing, no OpenAI key)
npm run orchestrator:scripted

# Or with an LLM (set OPENAI_API_KEY in .env first)
npm run orchestrator
```

The Orchestrator runs in its own terminal because it owns a readline prompt — `concurrently`
multiplexes stdout and cannot give it a TTY.

## Demos (the acceptance suite)

Each demo is self-contained: it spawns the servers it needs on offset ports (14001+), asserts on
**artifact contents** (never console text), and exits non-zero on failure. The harness scrubs
`OPENAI_API_KEY`/`LANGFUSE_*` from child environments — keyless-ness is enforced, not assumed.

```bash
npm run demo                 # run all demos in order
node demos/02-sync-message.js  # or any single demo
```

Slice 0's exit criterion: demos `01-discovery` … `07-end-to-end` pass in `--scripted` mode with no
API keys.

## Telemetry (optional)

Every process initializes OpenTelemetry through its first-import
`src/telemetry.js` (http + undici instrumentation → W3C trace context crosses
every A2A hop; proven by `packages/a2a-common/test/tracing.test.js`). It is a
complete no-op unless configured:

- `OTEL_TRACING=true` plus standard `OTEL_EXPORTER_OTLP_*` variables enables
  OTLP export in any process.
- Langfuse keys in `.env` (see `.env.example`) attach the Langfuse span
  processor — Orchestrator only, and never in `--scripted` demo runs.

## Tests

```bash
npm test                     # every workspace's Vitest suite + the demo suite
npm run lint                 # eslint (flat config)
npm run format               # prettier --check (semi: false)
```

## Layout

```
packages/schemas      Zod contracts + fixtures + JSON-schema exports (single source of truth)
packages/a2a-common   Hapi ⇄ @a2a-js/sdk bridge (incl. SSE), cards, client factory, config, logging
apps/portfolio-agent  :4001   apps/strategy-agent  :4002   apps/tax-agent  :4003
apps/orchestrator     CLI (no port in Slice 0; 3000 reserved for Slice 7 webhooks)
demos/                one script per A2A concept + shared harness
design/               the design docs; design/errata.md records SDK corrections + fixture overrides
```

Read `design/implementationPlan.md` for the build plan and decision log, `design/errata.md` for
where the implementation deliberately diverges from the docs (verified SDK naming, re-derived
fixture numbers, Slice 0 simplifications).
