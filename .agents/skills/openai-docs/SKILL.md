---
name: openai-docs
description: Verify and apply current official OpenAI guidance for this repository's @openai/agents Orchestrator, Responses-backed runs, model selection, prompts, tools, memory sessions, and Agents SDK tracing. Use for OpenAI API questions, model or prompt upgrades, SDK behavior, and changes involving apps/orchestrator/src/ or OpenAI trace processing.
---

# OpenAI Docs for the Orchestrator

Use current official documentation before making claims or implementation changes. Prefer the configured OpenAI documentation MCP tools; if unavailable, use official OpenAI web sources. Use bundled references only as a disclosed fallback.

## Workflow

1. Inspect `apps/orchestrator/package.json`, the shared config in `packages/a2a-common`, and the affected Agents SDK call site.
2. Preserve an explicitly requested model. For “latest,” “current,” or unspecified model upgrades, run `node scripts/resolve-latest-model-info.js` and fetch the exact returned guidance URLs.
3. Verify the installed `@openai/agents` API before changing run options, tools, sessions, or tracing. Inspect package exports or source when documentation and installed behavior may differ.
4. Keep model upgrades narrow: update active defaults and directly related prompts or tests, not historical examples or unrelated provider code.
5. Validate behavior with mocked model runs and focused Vitest coverage; do not require a live API key for repository tests, and keep `--scripted` mode keyless.
6. Cite the official page used and disclose when bundled fallback material was necessary.

## Project boundaries

- The Orchestrator CLI is the only process that runs an LLM; agent servers stay deterministic — never add a model call to them.
- The Agents SDK run drives the A2A tool calls; do not bypass Zod contract validation on tool inputs or agent results.
- `contextId` groups all of a conversation's tasks across agents. Langfuse trace sessions are a separate, Orchestrator-only grouping; never mix the two.
- The `--scripted` keyword matcher must remain a working keyless replacement for the LLM path.
- Keep optional tracing non-blocking and never expose keys or full sensitive payloads in logs.

## References

- Read [references/latest-model.md](references/latest-model.md) only when live official guidance is unavailable.
- Read [references/prompting-guide.md](references/prompting-guide.md) for prompt migrations.
- Read [references/upgrade-guide.md](references/upgrade-guide.md) for scoped model upgrades.
