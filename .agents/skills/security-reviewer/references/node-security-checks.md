# Safe Node Security Checks

## Repository review

- Search tracked files for credential-like assignments, authorization headers, and payload logging.
- Inspect the `packages/a2a-common` config module for validation and safe defaults.
- Inspect Hapi payload limits and accepted content types.
- Trace configured URLs into discovery and transport calls.
- Verify timeout and cancellation reach all external operations.
- Verify user-controlled metadata cannot select stored state.
- Inspect the Orchestrator's optional tracing setup and configuration for exported model or tool inputs, outputs, session metadata, and URLs; assess exposure without printing trace payloads.
- Review dependency changes against the lockfile and public SDK guidance.

## Local commands

```bash
npm run lint
npm test
git diff --check
```

Run the networked `npm audit` registry check only when external access is explicitly authorized.

Do not install scanners, alter dependencies, contact external targets, or run active probes without explicit authorization. Treat audit output as evidence to validate, not an automatic finding.

## Secrets

Never print `.env`, environment values, keys, tokens, full messages, conversation history, or trace payloads during review. Report a secret finding by location and variable name without repeating its value.
