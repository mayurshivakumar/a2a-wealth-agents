# Prompting Fallback

Use this only when the current official prompting guide cannot be fetched.

## Migration approach

1. Start from the existing Orchestrator prompt and representative requests.
2. Change the model while preserving the current prompt and effective reasoning behavior.
3. Run the same evaluations before editing the prompt.
4. Remove repeated instructions and tools unrelated to the Orchestrator's role.
5. Add only the smallest instruction that fixes an observed regression.

## Prompt shape

State:

- the agent's user-visible outcome;
- success criteria and required output;
- its allowed tools and routing boundary;
- safety, evidence, and permission constraints;
- stopping conditions.

Leave implementation choices to the model when they do not change the contract.

## A2A invariants

- The Orchestrator delegates portfolio, strategy, and tax work to deterministic A2A agents; it never computes financial results itself.
- Tool descriptions must distinguish the agents clearly: Portfolio standardizes holdings, Strategy streams allocations, Tax runs the long-running harvest task.
- The final output must remain non-empty text, while standardized financial data stays in Zod-validated `data` Parts rather than prose.
- Prompts must not expose tracing metadata, configuration, keys, or the raw holdings paste.
- Do not ask the model to compensate for transport, task-lifecycle, validation, or tracing bugs.

Validate prompt changes with stable examples for holdings parsing, philosophy-to-allocation, the tax harvest flow including `input-required`, agent-failure handling, and follow-up conversation behavior.
