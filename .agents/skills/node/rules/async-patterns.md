# Async Work and Timeouts

## Remote calls

- Use the configured `requestTimeoutMs`; do not introduce an independent default at a call site.
- Apply the timeout to both agent-card discovery and JSON-RPC message delivery.
- Combine a caller-provided signal with the timeout signal so cancellation remains observable.
- Translate transport failures once, at the remote-agent boundary, and preserve the original error as `cause`.

## Concurrent work

- Await every promise whose failure affects the request.
- Each agent runs as its own process; the Orchestrator waits on each server's `/healthz` before discovery instead of assuming start order.
- Roll back partially started resources in reverse order.
- Use `Promise.all` only when tasks are independent and partial completion is harmless.

## Cleanup

- Clear explicit timers in `finally`.
- Close servers, OpenTelemetry SDKs, span processors, and Langfuse clients during shutdown.
- Make shutdown idempotent so duplicate signals cannot race cleanup.
- In tests, register cleanup immediately after creating a resource.

## Review checklist

- Is every external wait bounded?
- Does cancellation reach the underlying operation?
- Can a rejected promise escape without structured logging?
- Does the success and failure path release the same resources?
