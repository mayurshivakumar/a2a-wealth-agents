# Repository Guidelines

## Project Structure & Module Organization

**Slice 0 is complete** (its `01`–`07` demos pass keyless); slices 1+ are unbuilt. Start with `CLAUDE.md`, then use `design/implementationPlan.md` as the authoritative implementation guide; `design/errata.md` records where the implementation deliberately diverges from the docs — read it before trusting a doc detail against the code. Supporting architecture, protocol flows, fixtures, and acceptance transcripts live under `design/`.

The npm-workspaces layout is:

- `packages/schemas/` — shared Zod contracts, static fixtures, and JSON-Schema exports (`@wealth/schemas`).
- `packages/a2a-common/` — Hapi ⇄ `@a2a-js/sdk` bridge (incl. SSE), agent-card/client factories, config, logging, tracing (`@wealth/a2a-common`).
- `apps/<name>-agent/` — deterministic A2A servers (portfolio :4001, strategy :4002, tax :4003); `apps/orchestrator/` is the only LLM-enabled process.
- `demos/` — the scripted acceptance suite (`01`–`07`) plus its harness; later slices add recorded provider fixtures here.

Do not add later-slice agents before Slice 0's `01`–`07` demos pass (`npm run demo`).

## Build, Test, and Development Commands

- `npm install` — install all workspace dependencies (Node.js 20+).
- `npm run dev` — start the three agent servers via `concurrently` (the Orchestrator runs in its own terminal because it owns a readline prompt).
- `npm run orchestrator:scripted` — the deterministic, API-key-free CLI flow (`npm run orchestrator` uses the LLM when `OPENAI_API_KEY` is set).
- `npm test` — every workspace's Vitest suite plus the demo suite.
- `npm run demo` — demos `01`–`07` only (Slice 0's exit criterion; the harness scrubs API keys from child processes).
- `npm run lint` / `npm run format` — ESLint and `prettier --check` (use `npm run format:write` for fixes).

## Coding Style & Naming Conventions

Use plain JavaScript ESM with two-space indentation, `import`/`export`, and no transpilation. Prettier is authoritative and must use `semi: false`. Use `camelCase` for variables/functions, `PascalCase` for classes and Zod schema objects, and kebab-case for workspace directories. Name versioned contracts by their wire form (for example, `portfolio-v1`) and validate every process boundary with schemas from `packages/schemas`.

## Testing Guidelines

Use Vitest and name test files `*.test.js`. Each contract needs valid/invalid fixtures, round-trip parsing, and JSON-schema snapshots. Test agents through an in-process `DefaultRequestHandler` on ephemeral ports. Mock external HTTP with Undici `MockAgent`; CI must never require live provider keys. Add an integration test for every applicable failure/degradation-matrix row, and assert artifact data rather than console wording.

## Commit & Pull Request Guidelines

Follow the existing history's style: concise, imperative subjects with an optional scope, such as `feat(tax): add input-required lifecycle`. Keep commits limited to one slice or concern. Pull requests should identify the slice, summarize protocol/schema changes, link an issue or design section, list commands run, and include demo output for user-visible flows. Document new environment variables in `.env.example`; never commit API keys or raw portfolio data.
