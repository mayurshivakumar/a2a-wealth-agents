# Happy Path — Sample Conversation

One uninterrupted end-to-end run through the Orchestrator CLI (`:3000`). User pastes holdings, picks Bogleheads, and gets an approved execution plan. Single `contextId` (`ctx-2c91`) spans all tasks. Flows A → B′ (+D, E) → C → F from `completeDesign.md §5`.

---

```text
$ npm run start --workspace apps/orchestrator

Wealth Orchestrator v1.0 — connected agents:
✔ portfolio :4001   ✔ strategy :4002 (card signed ✓)
✔ tax :4003 (card signed ✓)   ✔ risk :4004   ✔ research :4005

Paste your holdings to begin.
```

## Step 1 — User pastes holdings

```text
> Fidelity taxable account: 120 shares VTI avg cost $198 (lot 1: 50 @ $185
  bought 2022-03-10, lot 2: 30 @ $204 bought 2023-08-21, lot 3: 40 @ $210
  bought 2024-03-15), 40 AAPL @ $145 bought 2021-06-02, $8,500 cash.
  Vanguard Roth IRA: 60 VXUS @ $55 bought 2023-01-12, 30 BND @ $72
  bought 2023-01-12.
```

```text
⟳ Standardizing holdings… (Portfolio Agent, task pf-118d)
✔ Portfolio standardized (pf-118d · completed)

  Account       Type      Symbol  Lots  Qty   Avg cost
  fid-tax-001   taxable   VTI     3     120   $197.75
  fid-tax-001   taxable   AAPL    1     40    $145.00
  vg-roth-001   roth-ira  VXUS    1     60    $55.00
  vg-roth-001   roth-ira  BND     1     30    $72.00

  Uninvested cash: $8,500 (fid-tax-001)
  All lots have purchase dates — no follow-ups expected.

Artifact: standardized-holdings (portfolio-v1)

What investment philosophy should I apply?
  1) Bogleheads three-fund   2) Income-focused   3) Growth tilt
  4) Describe your own
```

## Step 2 — User selects Bogleheads

```text
> 1
```

```text
⟳ Strategy (task st-60fe) working — interpreting philosophy…
⟳ Strategy working — researching vehicles…
    └ Research (rs-93ab) fanned out: Market ✔ (webhook) · ETF ✔ · Company ✔
✔ Allocation ready (st-60fe · completed)

  Target allocation — "Bogleheads three-fund"
  Asset class        Weight   Top-ranked vehicles (score)
  US total market    50%      VTI (0.94) · ITOT (0.91) · SCHB (0.89)
  Intl developed     30%      VXUS (0.92) · IXUS (0.88)
  US bonds           20%      BND (0.95) · AGG (0.93)

  Market context: sideways regime, volatility 38th percentile,
  yield curve normal, recession signal: low (FRED asOf 2026-07-24)

Artifact: allocation-v1 (vehicles from research-brief-v1, 3 sources)

Generate the tax-optimized execution plan? (y/n)
```

## Step 3 — User confirms; tax plan runs straight through

```text
> y
```

```text
⟳ Tax Agent (task tx-4f27 · submitted) — LP solver started, polling…
⟳ tx-4f27 working — selecting lots…
⟳ tx-4f27 working — checking wash-sale windows…
✔ Execution plan ready (tx-4f27 · completed)

  Action  Account       Symbol  Lot      Qty   Reason
  SELL    fid-tax-001   AAPL    AAPL-001 40    Harvest $1,240 loss;
                                               redeploy per allocation
  SELL    fid-tax-001   VTI     VTI-003  40    Harvest $890 loss
  BUY     fid-tax-001   ITOT    —        46    US-market replacement,
                                               avoids VTI wash-sale
  BUY     fid-tax-001   VXUS    —        38    Reach 30% intl using cash
  HOLD    vg-roth-001   VXUS    —        60    Roth: no tax event
  HOLD    vg-roth-001   BND     —        30    Bonds stay tax-sheltered

  Estimated tax savings: $2,130
  Wash-sale warnings: none

Artifact: execution-plan-v1
```

## Step 4 — Risk gate clears automatically (no user input)

```text
🛡 Risk check (rk-7a05, references tx-4f27 + st-60fe): APPROVED
   Portfolio beta 0.96 · max sector concentration: tech 19% (< 25%)
   Est. max drawdown: 17% · violations: none

✅ Final plan cleared. Summary:
   6 actions · $2,130 est. tax savings · drift to target < 1.5%
   Full details in execution-plan-v1 + risk-report-v1 artifacts.

Anything else? (/tasks to inspect the run)
```

## Step 5 — (Optional) user inspects the run

```text
> /tasks

ctx-2c91
├── pf-118d  Portfolio  completed   standardized-holdings
├── st-60fe  Strategy   completed   allocation-v1
│   └── rs-93ab  Research  completed   research-brief-v1
│       ├── mk-2e61  Market    completed  market-snapshot-v1 (webhook)
│       ├── et-9d03  ETF       completed  etf-profile-v1
│       └── co-c4b8  Company   completed  company-fundamentals-v1
├── tx-4f27  Tax        completed   execution-plan-v1
└── rk-7a05  Risk       completed   risk-report-v1 (approved)
```

---

## Recap — three user actions, one plan

| User does | System returns |
| --- | --- |
| Pastes holdings | `portfolio-v1` — normalized accounts, lots, cash |
| Selects "Bogleheads" | `allocation-v1` — targets + live-researched vehicles |
| Confirms `y` | `execution-plan-v1` gated by approved `risk-report-v1` |
