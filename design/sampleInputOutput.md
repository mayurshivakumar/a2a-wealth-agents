# Sample Input / Output — A2A Portfolio Tax Optimizer

What a user types into the Orchestrator CLI (`:3000`) and what comes back. Each example maps to a flow in `completeDesign.md §5`. All examples share one `contextId` (`ctx-7f3a`) unless noted.

---

## 1. Paste holdings → standardized portfolio (Flow A, Portfolio Agent)

**User input:**

```text
> Here are my accounts:
  Fidelity taxable: 120 VTI bought at various times, avg cost $198;
  40 AAPL @ $145 from 2021; $8,500 cash
  Vanguard Roth IRA: 60 VXUS @ $55, 30 BND @ $72
```

**What happens:** Orchestrator routes the messy text as a text `Part` to Portfolio's `standardize-holdings` skill (sync `SendMessage`).

**Output:**

```text
✔ Portfolio standardized (task pf-a91c · completed)

  Account            Type       Symbol  Lots  Qty   Cost basis
  fid-tax-001        taxable    VTI     3     120   $198.00 avg
  fid-tax-001        taxable    AAPL    1     40    $145.00
  vg-roth-001        roth-ira   VXUS    1     60    $55.00
  vg-roth-001        roth-ira   BND     1     30    $72.00

  Uninvested cash: $8,500 (fid-tax-001)
  ⚠ 2 of 3 VTI lots missing purchase dates — tax step may ask for them.

Artifact: standardized-holdings (portfolio-v1)
```

**Error branch** — user pastes garbage:

```text
> optimize my stuff: 100 shares of ummm something
✘ Portfolio Agent rejected the input (RequestMalformedError, -32602):
  • holdings: expected at least one recognizable symbol/quantity pair
  Tip: paste account, symbol, quantity, and cost per share.
```

---

## 2. State a philosophy → researched allocation (Flow B′ + D + E)

**User input:**

```text
> I want a Bogleheads-style three-fund approach, but keep expense
  ratios under 0.10% and skip anything energy-sector heavy.
```

**What happens:** Strategy streams over SSE; internally it delegates to Research, which fans out to Market (SSE, which itself calls Economic for macro), ETF, and Company in parallel.

**Output (streamed to terminal):**

```text
⟳ Strategy (task st-42b7) working — interpreting philosophy…
⟳ Strategy working — researching vehicles… (delegated to Research)
✔ Allocation ready (task st-42b7 · completed)

  Target allocation — "Bogleheads three-fund, ER < 0.10%, ex-energy"
  Asset class        Weight   Top-ranked vehicles (score)
  US total market    50%      VTI (0.94) · ITOT (0.91) · SCHB (0.89)
  Intl developed     30%      VXUS (0.92) · IXUS (0.88)
  US bonds           20%      BND (0.95) · AGG (0.93)

  Market context: sideways regime, volatility 38th percentile,
  yield curve not inverted, recession signal: low (FRED asOf 2026-07-24)

Artifact: allocation-v1 (vehicles from research-brief-v1, 3 sources)
```

**Degraded branch** — Research unreachable:

```text
✔ Allocation ready (degraded)
  ⚠ Live research unavailable — vehicle selection used the built-in
    lookup table (metadata.degraded: true). Rankings are heuristic.
```

---

## 3. Run tax optimization → pauses for missing data (Flow C, `input-required`)

**User input:**

```text
> OK, generate the tax-optimized execution plan.
```

**Output:**

```text
⟳ Tax Agent (task tx-9e01 · submitted) — LP solver started, polling…
⟳ tx-9e01 working — selecting lots…

❓ Tax Agent needs input (tx-9e01 · input-required):
   "Purchase date for lot VTI-003 (40 shares @ $203)?"

> March 15, 2024

⟳ tx-9e01 working — resuming with purchase date…
✔ Execution plan ready (tx-9e01 · completed)

  Action  Account       Symbol  Lot      Qty   Reason
  SELL    fid-tax-001   AAPL    AAPL-001 40    Harvest $1,240 loss
  SELL    fid-tax-001   VTI     VTI-003  40    Harvest loss, no wash-sale
  BUY     fid-tax-001   ITOT    —        46    Replacement (not
                                               substantially identical)
  HOLD    vg-roth-001   VXUS    —        60    Roth: no tax benefit to sell

  Estimated tax savings: $1,870
  Wash-sale warnings: none

Artifact: execution-plan-v1
```

**Cancel branch:**

```text
> /cancel tx-9e01
✔ Task tx-9e01 canceled. (Any Research child tasks would cancel too.)
```

---

## 4. Risk gate — automatic before anything is shown (Flow F)

No user input; the Orchestrator will not render a plan without an approved `risk-report-v1`.

**Approved:**

```text
🛡 Risk check (task rk-33f0, references tx-9e01 + st-42b7): APPROVED
   Portfolio beta 0.97 · max sector concentration: tech 21% (< 25%)
   Est. max drawdown: 18% · violations: none
→ Plan above is cleared for execution.
```

**Rejected → remediation loop (max 2):**

```text
🛡 Risk check: REJECTED
   ✘ sector-concentration: tech 31% exceeds 25% cap (blocking)
⟳ Re-running Tax Agent with violation constraints (attempt 1 of 2,
  new task tx-b112 referencing tx-9e01)…
✔ Revised plan approved on retry — tech reduced to 23%.
```

After 2 failed loops:

```text
✘ Risk still rejects after 2 remediation attempts. Your call:
  1) accept plan with violations  2) adjust philosophy  3) abort
```

---

## 5. Inspect the distributed system

**User input:**

```text
> /tasks
```

**Output (task tree, reconciled via ListTasks):**

```text
ctx-7f3a
├── pf-a91c  Portfolio  completed   standardized-holdings
├── st-42b7  Strategy   completed   allocation-v1
│   └── rs-77d2  Research  completed   research-brief-v1
│       ├── mk-08aa  Market    completed  market-snapshot-v1 (webhook)
│       ├── et-1c44  ETF       completed  etf-profile-v1
│       └── co-5b19  Company   completed  company-fundamentals-v1
├── tx-9e01  Tax        completed   execution-plan-v1
└── rk-33f0  Risk       completed   risk-report-v1 (approved)
```

```text
> /agents
✔ portfolio :4001   ✔ strategy :4002   ✔ tax :4003 (card signed ✓)
✔ risk :4004        ✘ research :4005 unreachable — vehicle research
                      will degrade to lookup table
```

---

## 6. Failure surfaces the user actually sees

| Situation | CLI output |
| --- | --- |
| FMP rate limit | `⚠ ETF data unavailable (retryAfter 3600s) — brief marked degraded, ETF scores at lower confidence` |
| All data agents down | `✘ Research failed — falling back to built-in vehicle table (degraded)` |
| Unanswered `input-required` | `⏸ tx-9e01 still waiting on purchase date for VTI-003. Reply, or /cancel tx-9e01.` |
| Invalid card signature | `✘ Tax Agent card failed JWS verification — refusing to route. Tax features disabled.` |
| Version mismatch | `✘ strategy :4002 speaks A2A 0.3, need 1.0 (VersionNotSupportedError)` |
