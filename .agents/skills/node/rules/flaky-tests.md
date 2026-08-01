# Diagnosing Flaky Vitest Tests

## Procedure

1. Run the single file repeatedly with `npx vitest run path/to/test.js`.
2. Run the single test by name when the file contains unrelated cases.
3. Look for shared module state, reused ports, wall-clock assumptions, unresolved promises, and incomplete teardown.
4. Replace real clocks, ID generation, model calls, fetch, or tracing with injected deterministic implementations.
5. Register cleanup as soon as the resource is created.
6. Re-run the isolated test, its related suite, and `npm test`.

## Common repository causes

- A loopback server was not stopped.
- A promise rejection occurred after the assertion completed.
- A test reused a global trace processor or process listener.
- A store assertion depended on real time.
- A random port or UUID was asserted without injection.
- A timeout test waited on actual wall-clock duration.

Do not hide a race with retries or longer sleeps. Fix ownership and synchronization.
