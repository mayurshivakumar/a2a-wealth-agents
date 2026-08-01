# Inspecting Installed Dependencies

Inspect installed packages when behavior depends on the exact locked SDK version.

## Procedure

1. Read the dependency version in `package.json` and `package-lock.json`.
2. Inspect the package's `package.json`, especially `exports`, `type`, and entrypoints.
3. Search declarations, source, and tests with `rg` for the symbol or option.
4. Trace only the public path used by this repository.
5. Confirm assumptions with a small read-only Node expression or focused repository test.

Useful targets include:

- `@a2a-js/sdk` client factories, handlers, message types, and transport behavior
- `@openai/agents` run options, `MemorySession`, tools, and trace processors
- Langfuse tracing and client lifecycle APIs
- Hapi server start, stop, payload, and response behavior

Do not patch `node_modules`, depend on undocumented internals, or copy implementation code into the repository.
