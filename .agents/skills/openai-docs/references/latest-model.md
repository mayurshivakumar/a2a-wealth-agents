# Latest Model Fallback

Last verified against official OpenAI guidance: 2026-07-25.

Use this file only when current official documentation cannot be fetched. Model availability, limits, pricing, and feature support can change.

latestModelInfo:
  model: gpt-5.6-sol
  migrationGuide: /api/docs/guides/upgrading-to-gpt-5p6-sol.md
  promptingGuide: /api/docs/guides/prompt-guidance-gpt-5p6.md

## A2A project note

The repository currently defaults to `gpt-5.4-mini`, a cost-conscious role. Do not blindly replace it with the flagship model. If an upgrade is requested, fetch live guidance and evaluate the current mini-like GPT-5.6 tier before changing the default.

Preserve the existing `@openai/agents` run shape, tools, validated text output, Orchestrator-only model boundary, and trace integration unless the request explicitly includes broader API changes.
