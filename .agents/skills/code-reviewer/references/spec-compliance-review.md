# Specification Compliance Review

## Build the requirement map

Extract observable requirements from the user request, approved plan, `AGENTS.md`, endpoint documentation, and existing tests. Classify each as implemented, missing, contradicted, or not in scope.

## Trace each requirement

For every material requirement:

1. Identify the runtime implementation.
2. Identify its caller or consumer.
3. Identify focused verification.
4. Check failure and cleanup behavior.

Do not infer compliance from filenames, comments, or test names alone.

## Resolve conflicts

Explicit user requirements win over generic skill guidance. Repository `AGENTS.md` supplies durable constraints. Existing behavior remains authoritative when the request does not authorize a contract change.

## Report

Report only concrete mismatches or unverified risks. Cite the location and describe the observable consequence. Separate missing implementation from missing test evidence.
