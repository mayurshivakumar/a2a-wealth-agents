# Model Upgrade Fallback

Use this workflow only when current official migration guidance is unavailable, and disclose that limitation.

## Inventory

Inspect:

- the `OPENAI_MODEL` default and validation in the shared config (`packages/a2a-common`);
- Orchestrator agent construction and its A2A tool definitions under `apps/orchestrator/src/`;
- prompts and tool descriptions;
- `.env.example`, README examples, and tests that assert defaults;
- installed `@openai/agents` compatibility.

## Classify

- Model-only: API shape, tools, prompts, and output contract remain compatible.
- Model plus prompt: representative evaluations show a prompt-specific regression.
- Compatibility work: safe migration requires run-option, tool, session, tracing, or output-schema changes.
- Leave unchanged: historical examples, fixtures, or intentionally pinned behavior.

The current `gpt-5.4-mini` default is a cost-conscious role. Do not map it to a flagship model merely because the flagship is newest. Resolve current role-equivalent guidance first.

## Apply

Preserve the Agents SDK run path, the Orchestrator's `MemorySession`, the keyless `--scripted` mode, non-empty text output, the A2A tool wiring, and the optional Langfuse trace bridge. Keep model and prompt edits separate from optional feature adoption.

## Validate

Run `npm test` and `npm run lint`. For an explicitly authorized live evaluation, compare representative holdings-parsing, strategy, tax-harvest, `input-required`, tool-failure, and multi-turn cases for quality, latency, tool behavior, and cost before declaring the migration complete.
