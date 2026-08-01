# A2A Failure Map

| Symptom | First layer to inspect | Evidence |
| --- | --- | --- |
| Startup exits immediately | Config validation in `packages/a2a-common`, then the app's `src/index.js` | Validation error before a server binds |
| Port already in use | Other agent processes or leftover demo runs | Dev servers own 4001–4003; the demo suite starts offset ports (14001+) — a stale process holds the port |
| Agent unreachable at discovery | Agent process, `/healthz`, configured URL | The Orchestrator marks the agent offline instead of crashing; confirm with a direct loopback GET |
| Version not supported (`-32009`) | `A2A-Version` header, `ServerCallContext` | Header must be `1.0`; an absent header becomes `0.3` and is rejected |
| Method not found (`-32601`) | JSON-RPC method name | Use v1 `SendMessage`, not legacy `message/send` |
| Request malformed (`-32602`) | Raw payload, protobuf JSON shape, Zod contract | HTTP 200 JSON-RPC error envelope; Zod rejections carry stringified issues in the error metadata |
| Executor rejects a valid-looking message | Wire/in-process conversion boundary | Wire uses `TASK_STATE_*`/`ROLE_*` strings and flat parts; executors receive numeric enums/oneofs |
| SSE stream drops mid-task | `packages/a2a-common/src/server.js` SSE bridge, then `resubscribeTask` | Resubscribe replays a `Task` snapshot while the task is live; on a terminal task it throws `-32004` — fall back to `getTask` |
| Task stuck in `WORKING` | `TAX_SIMULATED_DELAY_MS`, then the Orchestrator's 2 s `getTask` poller | Delay config in `apps/tax-agent`; poll-loop logs show whether polling is running |
| `input-required` never answered | Orchestrator prompt loop | The 60 s idle reminder should fire; follow-up turns keep the same `taskId`, and every `execute()` turn must publish a `task` or `message` event first |
| Follow-up rejected on a finished task | Terminal task state (`-32002`/`-32004`) | Terminal tasks are immutable; open a new task under the same `contextId` |
| Agent returns generic failure text | The agent's executor, for example `apps/tax-agent/src/executor.js` | Structured executor error and artifact validation before publish |
| Traces missing or ungrouped | Orchestrator-only Langfuse setup | Tracing is a no-op without keys and never involves agent servers |
| Test or process does not exit | Hapi, SSE streams, timers, listeners, OTel, Langfuse | Missing awaited cleanup |

Follow the data path only as far as evidence requires. Do not blame the OpenAI model when the failure occurs during A2A discovery, validation, or transport — and never look for an LLM inside an agent server; only the Orchestrator runs one.
