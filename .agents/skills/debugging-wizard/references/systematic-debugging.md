# Systematic Debugging

## Phase 1: Reproduce

Record the exact command, input shape, expected result, actual result, and whether the failure is deterministic. Prefer a focused Vitest reproduction over the live mesh.

## Phase 2: Locate the boundary

Trace one request through configuration, launch, discovery, transport, message conversion, executor, model run, event publication, and cleanup. Stop at the first point where observed state differs from the contract.

## Phase 3: Test one hypothesis

State a prediction before running a check. Change one variable: injected fetch, model runner, clock, ID factory, logger, session wrapper, or URL. A check that cannot disprove the hypothesis is not useful.

## Phase 4: Explain

Provide:

1. Root cause
2. Evidence
3. Affected boundary
4. Why existing tests missed it
5. Minimal correction and regression case, if a fix was requested

## Phase 5: Verify

Run the regression test, related test file, full suite, and lint. Confirm cleanup and public error behavior, not just the successful output.

If two attempted fixes fail, return to the boundary map with fresh evidence instead of stacking speculative changes.
