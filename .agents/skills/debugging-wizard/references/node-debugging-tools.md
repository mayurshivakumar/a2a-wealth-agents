# Node Debugging Tools

## Focused tests

```bash
npm test --workspace packages/schemas
npm test --workspace packages/a2a-common
npm test --workspace apps/portfolio-agent
npm test --workspace apps/tax-agent
npm test --workspace apps/orchestrator
```

Use the workspace matching the failing boundary. Narrow further to one file with `-- test/<name>.test.js` or by test name when necessary.

## Local protocol checks

Use in-process handlers in tests when possible. For a running local mesh, inspect only documented loopback endpoints:

```bash
curl -sS http://localhost:4001/.well-known/agent-card.json
curl -sS http://localhost:4003/healthz
```

Set `LOG_LEVEL=debug LOG_FORMAT=pretty` for local reproduction. Use existing structured events rather than adding persistent direct console calls.

## Runtime inspection

Use `node --inspect-brk apps/tax-agent/src/index.js` (or the affected app's entrypoint) only when a focused test cannot expose the state. Inspect installed SDK exports and source with `rg` before assuming option or event shapes.

Do not include keys in commands, paste full payloads into logs, or contact non-loopback services without authorization.
