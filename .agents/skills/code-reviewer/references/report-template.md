# Review Report

Lead with findings in descending severity.

## Finding format

```text
[severity] Concise title — path/to/file.js:line

Explain the concrete input or sequence that fails, the observed consequence,
and why the changed code causes it. End with a scoped remediation direction.
```

Use:

- Critical: credential exposure, cross-conversation access, data loss, or broadly exploitable behavior.
- High: common request failure, broken public contract, or cleanup failure with operational impact.
- Medium: narrower correctness, resilience, or maintainability regression.
- Low: actionable issue with limited impact.

Do not report style preferences already enforced by lint. Do not inflate hypothetical concerns without a reachable failure path.

If no findings exist, state that clearly and list only meaningful residual validation gaps.
