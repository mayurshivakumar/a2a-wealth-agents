# A2A Threat Model

## Intended deployment

This is an unauthenticated localhost mesh for local demonstration. Slice 0 ships no authentication; `securitySchemes` and JWS card signatures arrive in Slice 8. Binding or exposing any agent beyond the intended trusted environment changes the threat model and must be called out explicitly.

## Assets

- OpenAI and Langfuse credentials, held by the Orchestrator process only
- The user's raw holdings paste and the Zod-validated financial data derived from it
- In-memory task stores and the Orchestrator's task registry
- Agent availability and local process resources
- Integrity of agent cards and the served JSON schemas

## Trust boundaries

1. CLI user to the Orchestrator
2. Orchestrator to each agent server's Hapi A2A endpoint (:4001–:4003 in Slice 0)
3. Orchestrator to OpenAI
4. Optional trace export to Langfuse (Orchestrator only)
5. Environment variables to validated runtime config

## Priority abuse cases

- Oversized, malformed, or non-schema payloads consume resources or bypass Zod validation.
- A slow or unreachable agent holds Orchestrator work indefinitely; a dropped SSE stream leaks resources.
- A configured agent URL sends financial data to an unintended host.
- A client-supplied `contextId` joins or reads another conversation's tasks.
- Logs or traces capture keys, raw holdings, or full payloads.
- `OPENAI_API_KEY` or `LANGFUSE_*` leaks into an agent server process or demo output; the demo harness must scrub them.
- Optional tracing failure blocks startup or shutdown.
- In-memory task stores, registries, and caches grow without bounds within a process lifetime.
- Missing or inconsistent A2A version validation bypasses the intended v1-only protocol boundary; an absent `A2A-Version` header must be rejected.
- The webhook and push-notification surface arriving in Slice 7 (signed callbacks, nonce cache) widens this model and needs its own review then.

## Required controls

Keep the payload size limit, per-request `ServerCallContext` and `A2A-Version: 1.0` validation, Zod parsing at every process boundary, bounded timeouts, structured logging that excludes secrets and raw holdings, config validation, and non-blocking tracing. Keep every LLM call and every secret inside the Orchestrator process.
