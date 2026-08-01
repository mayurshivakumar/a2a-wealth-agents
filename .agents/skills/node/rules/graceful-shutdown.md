# Process Startup and Shutdown

## Startup

Each agent is its own process. `npm run dev` starts Portfolio (:4001), Strategy (:4002), and Tax (:4003) with `concurrently`; the Orchestrator CLI runs separately and waits on each server's `/healthz` before card discovery, marking unreachable agents offline instead of crashing.

Within a process, validate config before binding the Hapi server. If startup fails partway, stop only the started resources in reverse order and rethrow the startup error.

## Shutdown

- Stop the Hapi server with a bounded shutdown timeout.
- Install `SIGINT` and `SIGTERM` handlers once.
- Guard shutdown with an idempotence flag.
- Stop A2A servers and clients before flushing and shutting down the Orchestrator's optional tracing resources.
- Set `process.exitCode` on cleanup failure; do not call `process.exit()` from reusable modules.
- Remember all state is in-memory by design: a restart intentionally clears task stores and registries.

## Tests

Inject server doubles, logger spies, and a process-like object. Cover startup rollback, normal shutdown, duplicate signals, and failure logging. Do not bind real ports unless transport behavior is the subject.
