# Contract Evolution

## Compatibility review

The current baseline is A2A v1-only. The SDK's v0.3 compatibility layer is intentionally disabled, so the Orchestrator and every agent server upgrade atomically and legacy clients are not compatible.

Before changing a route, card, message, task, or artifact:

1. Identify every consumer: the Orchestrator, sibling agents (Research also acts as an A2A client in later slices), and the `demos/` acceptance suite.
2. Compare the proposal with the installed A2A SDK contract.
3. Decide whether existing clients can continue without changes.
4. Update producer and consumer tests together.
5. Update demo transcripts and README request/response examples when the public contract changes.

For message changes, review the protobuf JSON wire shape separately from the SDK's in-process numeric-enum/oneof shape and update tests at both layers.

## Additive changes

Data contracts evolve by adding a new versioned name in `@wealth/schemas` — `portfolio-v2` beside `portfolio-v1` — never by mutating a published `*-v1` schema. Regenerate the JSON-schema exports served at `/schemas/{name}.json` and update card skills' `schema:`/`produces:` tags to match. Optional metadata such as `metadata.degraded` and new card examples are also safe when existing valid messages keep parsing.

## Breaking changes

Treat path, transport, protocol version, required field, content mode, capability, identifier, or error-envelope changes as breaking. Do not silently change an agent's declared interaction mode — blocking versus streaming versus long-running task — and never mutate an existing `*-v1` contract in place.

## Version alignment

Keep each agent card interface's `protocolVersion` aligned with the SDK behavior and each agent's version aligned with its published behavior. Do not restore v0.3 top-level card fields or enable compatibility solely because a dependency exposes them; an explicit compatibility decision and cross-version tests are required.
