# ESM Modules

This repository is plain JavaScript with `"type": "module"`.

## Rules

- Use static `import` and named `export`.
- Include `.js` on relative imports.
- Prefer small named exports over broad default-export objects.
- Keep network, model, logger, clock, ID, and tracing boundaries injectable.
- Do not introduce CommonJS wrappers, typed source files, transpilation, or generated declarations.
- Use `node:` prefixes for Node built-ins.
- Avoid import-time side effects. Start servers and global tracing from explicit entrypoints.

## Dependency inspection

Before importing a deep path from a dependency, inspect its `package.json` exports and installed source. Prefer documented public exports to internal paths.
