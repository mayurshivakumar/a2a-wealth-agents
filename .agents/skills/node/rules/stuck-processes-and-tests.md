# Stuck Processes and Tests

## Isolate

Run the narrowest file with a bounded command:

```bash
npm test --workspace packages/a2a-common -- test/server.test.js
npm test --workspace apps/tax-agent -- test/executor.test.js
```

If the test finishes but Node remains alive, inspect resources created by the test before changing production code.

## Likely handles

- Hapi listeners
- Open SSE response streams
- Pending fetch or A2A client operations
- Timers and timeout signals
- Process signal listeners
- OpenTelemetry SDK or Langfuse clients
- Unfinished event-bus work

## Fix

- Return or await the cleanup promise.
- Stop servers in reverse order.
- Shut down tracing processors and clients.
- Remove injected process listeners when the test owns them.
- Avoid module-global resource creation.

Verify the focused file exits cleanly, then run the full suite. Do not force-kill the process as the final fix.
