---
name: code-reviewer
description: Review changes to this repository's A2A agent mesh for correctness, regressions, security, maintainability, and test quality, with special attention to transport contracts, task lifecycle, timeout cleanup, Zod boundary validation, deterministic servers, dependency injection, structured logging, configuration, tracing degradation, and deterministic Vitest coverage. Use for diffs, pull requests, audits, or pre-merge reviews.
---

# A2A Code Reviewer

Review the requested diff or audit scope and enough surrounding code to prove each finding. Do not modify files unless the user separately requests fixes.

## Workflow

1. Restate the change intent or audit scope and identify affected runtime and test boundaries.
2. Inspect the diff when one exists, plus relevant callers, callees, configuration, and focused tests.
3. Check protocol behavior, state isolation, cleanup, logging, failure handling, and optional tracing.
4. Report only actionable findings introduced by the change or present in the requested audit scope. Use file and line references and explain the concrete failure mode.
5. Put findings first in severity order. If there are none, say so and mention residual testing gaps.

## Review priorities

- A2A v1 discovery, version validation, JSON-RPC, message, task, streaming, and `AgentEvent` behavior.
- Remote-call timeout and lifecycle cleanup.
- One `contextId` grouping a conversation's tasks; terminal tasks stay immutable, with follow-ups as new tasks.
- LLM confinement to the Orchestrator; every agent server stays deterministic and reproducible.
- Zod parsing at every process boundary and artifact validation before publish; financial data in `data` Parts, never prose.
- Winston metadata, `{ err: error }`, and absence of secrets or full payloads.
- Disabled-by-default Langfuse behavior and non-blocking failures.

## References

- Read [references/a2a-review-checklist.md](references/a2a-review-checklist.md) for repository-specific checks.
- Read [references/spec-compliance-review.md](references/spec-compliance-review.md) when comparing an implementation with a request or plan.
- Read [references/report-template.md](references/report-template.md) for the final findings format.
