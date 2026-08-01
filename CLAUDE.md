# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

**Slice 0 implementation is in progress** (npm-workspaces monorepo scaffolded; check `ls`/`git log` for what exists before referencing a path from the docs). Where implementation reality diverges from the design docs — verified SDK naming, re-derived fixture numbers, Slice 0 simplifications — **`design/errata.md` records the correction and wins**. Everything under `design/` remains the specification; slices after 0 are unbuilt.

## Reading order for the design docs

The docs were written in this sequence and each supersedes/extends the last. Read in this order when picking up the project:

1. **`design/design.md`** — original architectural blueprint (10-agent A2A mesh). High-level only; superseded in detail by `completeDesign.md`.
2. **`design/a2a-learning-slice.md`** — "Slice 0": a deliberately scoped-down 4-process version (Orchestrator + Portfolio + Strategy + Tax) that exercises every core A2A v1.0 concept. **This is what gets built first.**
3. **`design/completeDesign.md`** — the full 10-process target system. Strict superset of the learning slice. This is the authoritative architecture reference (topology, agent cards, data contracts, flows, security model, project layout).
4. **`design/implementationPlan.md`** — the actual build plan an agent should follow: a blocking decision log (D1–D6) that resolves every ambiguity left by the design docs, engineering conventions (language, monorepo, testing, auth, config), and a slice-by-slice plan (Slice 0 → 1 → 2 → ... → 9, plus floating Slice T). **This is the primary doc to work from when writing code.**
5. **`design/TODO.md`** — phase-based checklist of A2A protocol concepts still to cover; cross-referenced by `implementationPlan.md`'s coverage map.
6. **`design/sampleInputOutput.md`** and **`design/happyPathSampleInputOutput.md`** — canonical CLI conversation transcripts. These become the fixture/acceptance-test set (`implementationPlan.md` §2, Testing plan) — expected artifact contents and CLI output for each flow, including error and degraded branches.

When a detail conflicts between docs, prefer `implementationPlan.md` (most recent, most specific) over `completeDesign.md` over `design.md`.

## What this system is

A multi-agent portfolio tax-loss-harvesting optimizer built on the **A2A (Agent2Agent) v1.0 protocol** over JSON-RPC 2.0, using `@a2a-js/sdk` v1.0.0 (requires Node.js >= 20). One LLM-driven Orchestrator (A2A Client, `@openai/agents` + `gpt-5.4-mini`) delegates to a mesh of deterministic A2A Server agents:

- **Portfolio** (`:4001`) — standardizes messy pasted holdings into Zod-validated `portfolio-v1` lots.
- **Strategy** (`:4002`) — turns a philosophy (Bogleheads, ESG, etc.) into target allocations; delegates vehicle selection to Research.
- **Tax** (`:4003`) — long-running async task; LP solver for lot-level tax-loss harvesting + asset location, wash-sale safe.
- **Risk** (`:4004`) — synchronous gate: validates beta, sector concentration, drawdown before a plan may reach the user.
- **Research** (`:4005`) — sub-orchestrator (both A2A Server and Client): fans out to Market/ETF/Company, aggregates and scores.
- **Market** (`:4101`) / **ETF** (`:4102`) / **Company** (`:4103`) / **Economic** (`:4104`) — data-tier wrappers around Finnhub/FMP/FRED.

Core architectural invariants (don't violate these when implementing or reviewing):

- **The Orchestrator is the only place an LLM runs.** Every other process is deterministic and reproducible — Research's scoring is a deterministic composite, not a model call.
- **Gate enforcement is defense-in-depth:** both a system-prompt clause *and* a hard code post-condition ensure no execution plan is ever rendered to the user without an `approved` `risk-report-v1` artifact in the same `contextId`.
- **Tasks are immutable once terminal.** A rejected/completed task can't be reopened — remediation opens a *new* task carrying `referenceTaskIds` back to the old one under the same `contextId`. This is the mental-model shift A2A teaches vs. request/response.
- **Everything is in-memory.** Task stores, the Orchestrator's task registry, `MemorySession`, LRU caches, webhook nonce cache, circuit-breaker state — all reset on process restart. No database. This is a deliberate non-goal, not an oversight.
- **Degradation is a schema concern, not just an ops concern** (`metadata.degraded: true` on artifacts) — every failure mode has a defined fallback (see `completeDesign.md` §14 failure matrix) and callers must be told when they got a lower-quality answer.
- Data flows as Zod-validated `data` Parts, never raw financials in `text` Parts. Provider API keys (Finnhub/FMP/FRED) are confined to the data tier and never seen upstream.

## Engineering conventions (from `implementationPlan.md` §2 — don't re-derive or re-litigate these)

- **Plain JavaScript ESM**, Node >= 20, `"type": "module"`, no TypeScript, no build/transpile step — every workspace runs directly via `node`. Prettier with `semi: false`.
- Zod schemas in `packages/schemas` are the single source of truth for every contract, parsed at every process boundary; JSON-schema exports are generated from them for agent cards. JSDoc is welcome for editor IntelliSense, never required.
- **npm workspaces** monorepo per the `apps/*` + `packages/*` layout in `completeDesign.md` §12. Root `npm run dev` uses `concurrently` to start processes in dependency order: data tier (4104 → 4102/4103 → 4101) → mid tier (4005) → top tier (4001–4004) → Orchestrator (3000). Every server exposes `GET /healthz`; each process waits on its downstream dependencies' health before announcing ready.
- **Testing:** Vitest per package. Contract tests in `packages/schemas` (valid/invalid fixture pairs, round-trip parsing, JSON-schema snapshot tests). Agent unit tests run executor logic against an in-process `DefaultRequestHandler` on an ephemeral port, mocking external APIs with `undici`'s `MockAgent` against recorded fixtures in `demos/fixtures/{finnhub,fmp,fred}/*.json` — no live keys in CI. `sampleInputOutput.md` / `happyPathSampleInputOutput.md` conversations become the canonical `--scripted`-mode fixtures. One integration test per row of the `completeDesign.md` §14 failure matrix.
- Full config defaults (ports, poll intervals, timeouts, cache TTLs, rate budgets, solver limits, thresholds) are consolidated in one table in `implementationPlan.md` §2 — check there before inventing a number.
- The blocking decision log (D1–D6 in `implementationPlan.md` §1) already resolves: price data source (static fixture, D1), the tax LP solver's library/objective/constraints/wash-sale table (D2), flat-rate tax assumptions (D3), philosophy parsing via a closed enum + Orchestrator LLM (D4), the Risk Agent's static factor table and thresholds (D5), and Research's candidate universe + scoring weights (D6). Treat these as settled unless the user explicitly asks to revisit one.

## Build order

Follow the slice plan in `implementationPlan.md` §3 (dependency graph and per-slice detail). Summary: **Slice 0** (learning slice: `packages/schemas`, `packages/a2a-common`, Orchestrator + Portfolio + Strategy + Tax) must exist and pass its `--scripted`-mode demos before anything else. After that, `2→3→4→5→6→7` is a strict chain (Economic → ETF/Company → Market → Research fan-out → Strategy goes live → push notifications/cancellation), while Slice 1 (Risk gate) and Slice T (Tax LP upgrade) float in anywhere after their prerequisites. Slices 8 (security) and 9 (hardening) are last. Each slice lists its own exit criteria (a numbered demo under `demos/`) and degradation path — don't mark a slice done without both.
