# Design Errata — Slice 0

Corrections and clarifications discovered while implementing Slice 0, recorded so the design docs
(`design.md` → `completeDesign.md` → `implementationPlan.md` → `a2a-learning-slice.md`) can be read
safely alongside the actual code. Where a doc conflicts with an entry here, this file wins for the
implementation; the docs remain the architectural intent.

## 1. `@a2a-js/sdk@1.0.0` reality vs. design-doc naming

Verified against the published package (`dist/*.d.ts` and implementation).

| Design docs said | SDK reality (what the code uses) |
| --- | --- |
| `SendStreamingMessage` / `SubscribeToTask` / `ListTasks` methods | Those are **wire** (JSON-RPC) method names. Client API: `sendMessage`, `sendMessageStream`, `getTask`, `listTasks`, `cancelTask`, `resubscribeTask`. Handler API: `sendMessageStream`, `resubscribe`, `listTasks` |
| `taskArtifactUpdate` carries `index: 0` | `TaskArtifactUpdateEvent` has **no `index` field** — `{taskId, contextId, artifact, append, lastChunk, metadata}`. A single-chunk artifact is `append: false, lastChunk: true`; identity is `artifact.artifactId` |
| Task states are `TASK_STATE_*`, roles `ROLE_*` | True on the wire only. **In-process they are numeric protobuf enums** (`TaskState.TASK_STATE_WORKING === 2`). Use `taskStateToJSON()` for display and `isTerminal()` from `@wealth/a2a-common` for terminal checks |
| Parts are `{kind: ...}` or plain `{text}` in code | In-process shape is `{content: {$case: 'text'|'data'|'raw'|'url', value}, mediaType}`. The **wire JSON flattens** to `{text: "..."}` / `{data: {...}}` — hand-written `curl` payloads must use the flat form |
| "SDK sends `A2A-Version: 1.0` on every request" | True for SDK clients. A request **without** the header is treated as protocol 0.3 and rejected by v1.0-only cards with `VersionNotSupportedError` (**-32009**). Hand-rolled `fetch`/`curl` must set the header |
| `SubscribeToTask` reattaches a dropped stream | Only while the task is **live** (stream starts with a full `Task` snapshot, then live events). On a **terminal** task it throws `UnsupportedOperationError` (**-32004**) — the Orchestrator falls back to `getTask` |
| `input-required` continues the same `taskId` | Supported, with two caveats: a *blocking* `sendMessage` **returns** at `INPUT_REQUIRED` (it does not hold the connection), and every `execute()` turn — including follow-up turns — must publish a `task` or `message` event **first** |
| Error taxonomy | `RequestMalformedError` → -32602, unknown method → -32601, `TaskNotFoundError` → **-32001**, `TaskNotCancelableError` → **-32002**, `UnsupportedOperationError` → **-32004**, `VersionNotSupportedError` → **-32009**. JSON-RPC parse errors: the spec says -32700; the SDK maps malformed envelopes to -32602 — the acceptance test pins the SDK's actual behavior (see `packages/a2a-common/test`) |
| Agent cards | `capabilities` also requires `extensions: []`. `resubscribe` is gated on `capabilities.streaming: true` (hence Tax declares streaming even though its primary flow is polling). Portfolio's `streaming: false` makes a streaming send fail with -32004 — kept as a deliberate negative-path demo |
| Task has `createdAt` / `lastModified` | Not in v1.0 (`status.timestamp` only). The Orchestrator registry keeps its own timestamps |

Two load-bearing SDK semantics that shaped the design:

- **`sendMessageStream` persists task state only while its generator is consumed.** An abandoned
  HTTP consumer freezes the stored task. Therefore the Tax flow uses **non-blocking `sendMessage`**
  (whose event processing is detached from any consumer) plus `GetTask` polling; `SubscribeToTask`
  streams are pure observers. This makes a dropped subscribe stream harmless by construction.
- **There is no Hapi adapter in the SDK** (only `@a2a-js/sdk/server/express`). The Hapi bridge in
  `packages/a2a-common/src/server.js` hand-rolls SSE using the SDK's exported primitives
  (`formatSSEEvent`, `formatSSEErrorEvent`) and must create the Hapi server with
  **`compression: false`** — gzip buffering would destroy event-at-a-time delivery.

## 2. Transcript overrides (fixtures are re-derived, not copied)

The conversation transcripts (`sampleInputOutput.md`, `happyPathSampleInputOutput.md`) are the
canonical *shape* of each flow, but several figures are internally inconsistent with the decided
formulas. Per the doc-precedence rule, `implementationPlan.md` (D2/D3) wins:

- **`estimatedTaxSavings`** — transcripts print the raw harvested-loss sum ($2,130 = $1,240 + $890);
  D2/D3 define savings as `Σ loss × applicable rate` (24% short-term, 15% long-term). The code uses
  the formula; fixture expectations are re-derived (happy path: `2,617.50 × 0.15 = 392.63`).
- **VTI-002 goes un-harvested in the transcripts** even though it is a loss lot at the back-solved
  fixture prices. The stated greedy rule ("sell lots with losses in taxable accounts") wins: the
  canonical plan sells AAPL-001, VTI-002, and VTI-003.
- **`sampleInputOutput.md §1`'s vague paste** ("120 VTI bought at various times, avg cost $198")
  cannot be parsed into 3 lots by a deterministic parser. It is outside the accepted grammar; the
  demo fixtures use the explicit lot-list paste from the happy-path transcript. The "2 of 3 lots
  missing purchase dates" line is realized as "1 of 3" in the demo-05 fixture (exactly one undated
  *loss* lot, so exactly one `input-required` round, matching §3's single question).
- **Average cost display** — the happy-path table prints `$197.75` where the pasted lots compute to
  `$198.08`. Rendered values are always derived from the artifact, never copied from the transcript.

## 3. Slice 0 simplifications (superseded in later slices)

- **Wash-sale is same-symbol-only in Slice 0.** D2's `replacements-v1` substantial-identity table
  (VTI↔ITOT↔SCHB share a row, so ITOT would be an *invalid* replacement for VTI) arrives in
  Slice T. Both transcripts endorse the ITOT buy ("Replacement (not substantially identical)"),
  which matches same-symbol semantics. **When Slice T lands, the happy-path fixture's replacement
  buy must change to a different `replacements-v1` row** and this entry should be updated.
  Precise Slice 0 rule: a candidate loss lot of symbol X is blocked iff (a) another lot of X in any
  account has `purchaseDate` within 30 days before `portfolio.asOf`, or (b) the plan would buy X —
  (b) is enforced by construction because replacements never equal a sold symbol. All date math is
  UTC relative to `portfolio.asOf` (never wall-clock).
- **Schema discovery** — SDK `AgentSkill` has no input/output-schema fields, so "JSON-schema exports
  for agent cards" is realized as: skills carry convention tags `schema:<input-schema-name>` and
  `produces:<output-schema-name>`, and every server serves `GET /schemas/{name}.json` generated from
  the Zod source of truth. The Orchestrator asserts the expected tags at discovery (the docs'
  "schema compatibility check"). A2A *extensions* were deliberately not used — the implementation
  plan defers them out of capstone scope.
- **Text-Part invariant reconciliation** — CLAUDE.md's "data flows as Zod-validated `data` Parts,
  never raw financials in `text` Parts" governs **inter-agent standardized data** (`portfolio-v1`,
  `allocation-v1`, plans always travel as data Parts). The user's messy holdings paste is
  pre-standardization *user input* and is explicitly permitted as a `text` Part **into Portfolio
  only** (its card advertises `text/plain`; the transcripts route "the messy text as a text Part").
- **The Orchestrator binds no port in Slice 0.** It is a readline CLI; `ORCHESTRATOR_PORT=3000` is
  reserved in config for the Slice 7 webhook receiver.
- **`estimatedTaxSavings` uses hardcoded D3 defaults** (`{single, 24, 15, 0}`); `tax-profile-v1`
  and the `/taxprofile` command are Slice T. The `optimize_taxes` tool's `taxProfile?` parameter is
  accepted but ignored until then.
