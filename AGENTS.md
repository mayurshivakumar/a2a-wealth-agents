# Repository Guidelines

## Project Structure & Module Organization

Slice 0 implementation is in progress. Start with `CLAUDE.md`, then use `design/implementationPlan.md` as the authoritative implementation guide; `design/errata.md` records where the implementation deliberately diverges from the docs. Supporting architecture, protocol flows, fixtures, and acceptance transcripts live under `design/`.

The npm-workspaces layout is:

- `packages/schemas/` — shared Zod contracts and generated JSON Schema.
- `packages/a2a-common/` — server bootstrap, logging, telemetry, and A2A helpers.
- `apps/<name>-agent/` — deterministic A2A servers; `apps/orchestrator/` is the only LLM-enabled process.
- `demos/` — scripted walkthroughs and recorded provider fixtures.

Build Slice 0 first: schemas, common utilities, Orchestrator, Portfolio, Strategy, and Tax. Do not add later agents before its `01`–`07` demos pass.

## Build, Test, and Development Commands

There are no runnable scripts until the monorepo is scaffolded. The intended root commands are:

- `npm install` — install all workspace dependencies (Node.js 20+).
- `npm run dev` — start the complete agent mesh in dependency order.
- `npm test --workspaces` — run every workspace's Vitest suite.
- `npm run start --workspace apps/orchestrator -- --scripted` — run the deterministic, API-key-free CLI flow.
- `npx prettier --check .` — verify formatting; use `--write` for local fixes.

## Coding Style & Naming Conventions

Use plain JavaScript ESM with two-space indentation, `import`/`export`, and no transpilation. Prettier is authoritative and must use `semi: false`. Use `camelCase` for variables/functions, `PascalCase` for classes and Zod schema objects, and kebab-case for workspace directories. Name versioned contracts by their wire form (for example, `portfolio-v1`) and validate every process boundary with schemas from `packages/schemas`.

## Testing Guidelines

Use Vitest and name test files `*.test.js`. Each contract needs valid/invalid fixtures, round-trip parsing, and JSON-schema snapshots. Test agents through an in-process `DefaultRequestHandler` on ephemeral ports. Mock external HTTP with Undici `MockAgent`; CI must never require live provider keys. Add an integration test for every applicable failure/degradation-matrix row, and assert artifact data rather than console wording.

## Commit & Pull Request Guidelines

No commit history is available to establish a house style. Use concise, imperative subjects with an optional scope, such as `feat(tax): add input-required lifecycle`. Keep commits limited to one slice or concern. Pull requests should identify the slice, summarize protocol/schema changes, link an issue or design section, list commands run, and include demo output for user-visible flows. Document new environment variables in `.env.example`; never commit API keys or raw portfolio data.
