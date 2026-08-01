# Project TODO — A2A Learning Slice

## Phase 0 — Spec alignment

- [x] Target A2A v1.0: bump `@a2a-js/sdk` to `1.0.0` (stable on npm) and update `design.md` / `a2a-learning-slice.md` / `completeDesign.md` references from 0.3 → 1.0 (renamed operations, unified `Part`, `supportedInterfaces` cards, `SCREAMING_SNAKE_CASE` enums, error taxonomy, Node >= 20)

## Phase 1 — Core slice (build order from a2a-learning-slice.md §10)

- [ ] `packages/schemas` + static agent cards (v1.0 `supportedInterfaces` shape) — verify discovery with `curl`
- [ ] Portfolio Agent + minimal client script — Flow A (sync `SendMessage`, data Part → Artifact)
- [ ] Strategy Agent — Flow B (SSE via `SendStreamingMessage`, `StreamResponse` consumption)
- [ ] Tax Agent — Flow C (task lifecycle, `input-required`, `CancelTask`, `SubscribeToTask`)
- [ ] Orchestrator CLI with `--scripted` mode — end-to-end without API keys
- [ ] `@openai/agents` routing layer — plug in OpenAI key
- [ ] Telemetry (OpenTelemetry + Langfuse) and Winston log correlation

## Phase 2 — Messaging & tasks (missing A2A concepts)

- [ ] **File parts** — the remaining `Part` content kinds (`url` and `raw`); slice only uses `text` and `data`. Easy add: have the Tax Agent emit the execution plan as a CSV file Part (`raw` + `mediaType: "text/csv"`) alongside the data Part
- [ ] **Remaining task states** — `TASK_STATE_REJECTED` (agent declines a task upfront) and `TASK_STATE_AUTH_REQUIRED` (task pauses for credentials, distinct from `input-required`); slice only reaches submitted/working/input-required/completed/failed/canceled
- [ ] **Blocking vs non-blocking `SendMessage`** — `SendMessageConfiguration.returnImmediately` (v1.0 replaced `blocking` with inverted semantics), plus `acceptedOutputModes` negotiation
- [ ] **Message history** — `historyLength` on `GetTask`, and task history reconstruction; `createdAt`/`lastModified` timestamps on Task
- [ ] **`ListTasks`** — new v1.0 operation with filtering + cursor pagination; back the Orchestrator's `/tasks` command with it
- [ ] **referenceTaskIds & task immutability** — terminal tasks can't be restarted; follow-ups create a new task referencing the old one under the same `contextId`. Subtle but core to A2A's mental model
- [ ] **Artifact chunking** — `append`/`lastChunk` plus the v1.0 `index` field on streamed `taskArtifactUpdate` events for large artifacts

## Phase 3 — Deferred (from a2a-learning-slice.md §11)

- [ ] Push notifications (v1.0 operations: `CreateTaskPushNotificationConfig`, `GetTaskPushNotificationConfig`, `ListTaskPushNotificationConfigs`, `DeleteTaskPushNotificationConfig`; callbacks arrive in `StreamResponse` format)
- [ ] Security schemes + authenticated extended agent card (`capabilities.extendedAgentCard` + `GetExtendedAgentCard`)
- [ ] Agent card JWS signatures (`generateAgentCardSignature` / `verifyAgentCardSignature`)
- [ ] Alternate protocol bindings (gRPC, HTTP+REST with `application/a2a+json`) + multi-entry `supportedInterfaces` negotiation
- [ ] Multi-tenancy (`tenant` on requests and `AgentInterface`)
- [ ] Extensions (`capabilities.extensions`, `A2A-Extensions` header)
- [ ] v0.3 compat layer (`@a2a-js/sdk/compat/v0_3`) — only if we ever need to interop with a legacy peer
- [ ] Risk Agent, Research sub-tree, real data APIs (Finnhub, FMP, FRED)
