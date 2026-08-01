# Environment Configuration

Read environment variables only in the shared config module in `packages/a2a-common` and validate them with Zod.

## Rules

- Keep safe defaults in the schema.
- Treat blank optional secrets as absent.
- Validate ports as integers from 1 through 65535.
- Validate timeout values as positive and bounded.
- Normalize configured base URLs once.
- Derive agent URLs from ports only when explicit URLs are absent.
- Enable Langfuse by default only when both keys exist, unless `LANGFUSE_TRACING` explicitly overrides it.
- Never commit `.env` or put a secret value in `.env.example`.
- Pass the resulting config object into server creation; do not re-read `process.env` downstream.

## Change checklist

When adding a setting, update the schema, returned config shape, `.env.example`, README configuration table, and deterministic config tests. Confirm invalid values fail before any server starts.
