// Canonical demo/test fixtures, derived from the transcripts in
// design/{happyPathSampleInputOutput,sampleInputOutput}.md with numbers
// re-derived per design/errata.md (D2/D3 formula wins over transcript sums).
// Every demo and agent test asserts against THESE values so a price change
// fails loudly in exactly one place.

export const happyPathPaste =
  'Fidelity taxable account: 120 shares VTI avg cost $198 (lot 1: 50 @ $185 ' +
  'bought 2022-03-10, lot 2: 30 @ $204 bought 2023-08-21, lot 3: 40 @ $210 ' +
  'bought 2024-03-15), 40 AAPL @ $145 bought 2021-06-02, $8,500 cash. ' +
  'Vanguard Roth IRA: 60 VXUS @ $55 bought 2023-01-12, 30 BND @ $72 bought 2023-01-12.'

// The demo-05 variant: lot 3 has no purchase date, so exactly one undated
// LOSS lot exists and Tax pauses input-required exactly once (per the
// single question in sampleInputOutput.md §3).
export const missingDatePaste =
  'Fidelity taxable account: 120 shares VTI avg cost $198 (lot 1: 50 @ $185 ' +
  'bought 2022-03-10, lot 2: 30 @ $204 bought 2023-08-21, lot 3: 40 @ $210), ' +
  '40 AAPL @ $145 bought 2021-06-02, $8,500 cash. ' +
  'Vanguard Roth IRA: 60 VXUS @ $55 bought 2023-01-12, 30 BND @ $72 bought 2023-01-12.'

export const garbagePaste = 'optimize my stuff: 100 shares of ummm something'

const priceAsOf = '2026-07-28T16:00:00Z'

export const expectedHappyHoldings = [
  {
    accountId: 'fid-tax-001',
    accountType: 'taxable',
    symbol: 'VTI',
    lots: [
      {
        lotId: 'VTI-001',
        quantity: 50,
        costBasis: 185,
        purchaseDate: '2022-03-10',
      },
      {
        lotId: 'VTI-002',
        quantity: 30,
        costBasis: 204,
        purchaseDate: '2023-08-21',
      },
      {
        lotId: 'VTI-003',
        quantity: 40,
        costBasis: 210,
        purchaseDate: '2024-03-15',
      },
    ],
    currentPrice: 187.75,
    priceAsOf,
  },
  {
    accountId: 'fid-tax-001',
    accountType: 'taxable',
    symbol: 'AAPL',
    lots: [
      {
        lotId: 'AAPL-001',
        quantity: 40,
        costBasis: 145,
        purchaseDate: '2021-06-02',
      },
    ],
    currentPrice: 114,
    priceAsOf,
  },
  {
    accountId: 'vg-roth-001',
    accountType: 'roth-ira',
    symbol: 'VXUS',
    lots: [
      {
        lotId: 'VXUS-001',
        quantity: 60,
        costBasis: 55,
        purchaseDate: '2023-01-12',
      },
    ],
    currentPrice: 61.5,
    priceAsOf,
  },
  {
    accountId: 'vg-roth-001',
    accountType: 'roth-ira',
    symbol: 'BND',
    lots: [
      {
        lotId: 'BND-001',
        quantity: 30,
        costBasis: 72,
        purchaseDate: '2023-01-12',
      },
    ],
    currentPrice: 68.25,
    priceAsOf,
  },
]

export const expectedHappyCash = [{ accountId: 'fid-tax-001', amount: 8500 }]

// Greedy-harvester expectations for the happy-path portfolio (see errata §2):
// losses VTI-002 487.50 + VTI-003 890.00 + AAPL-001 1,240.00 = 2,617.50, all
// long-term vs a 2026+ asOf → savings 2,617.50 × 0.15 = 392.63; proceeds
// 13,142.50 (VTI) + 4,560 (AAPL) pooled into the us-total-market replacement
// ITOT at 92.10 → floor(17,702.50 / 92.10) = 192 shares.
export const expectedHappyPlan = {
  actions: [
    {
      type: 'sell',
      accountId: 'fid-tax-001',
      symbol: 'VTI',
      lotId: 'VTI-002',
      quantity: 30,
      reason: 'Harvest $487.50 loss',
    },
    {
      type: 'sell',
      accountId: 'fid-tax-001',
      symbol: 'VTI',
      lotId: 'VTI-003',
      quantity: 40,
      reason: 'Harvest $890.00 loss',
    },
    {
      type: 'sell',
      accountId: 'fid-tax-001',
      symbol: 'AAPL',
      lotId: 'AAPL-001',
      quantity: 40,
      reason: 'Harvest $1,240.00 loss',
    },
    {
      type: 'buy',
      accountId: 'fid-tax-001',
      symbol: 'ITOT',
      quantity: 192,
      reason: 'Replacement for us-total-market; avoids wash-sale on AAPL/VTI',
    },
    {
      type: 'hold',
      accountId: 'vg-roth-001',
      symbol: 'VXUS',
      quantity: 60,
      reason: 'roth-ira: no tax benefit to sell',
    },
    {
      type: 'hold',
      accountId: 'vg-roth-001',
      symbol: 'BND',
      quantity: 30,
      reason: 'roth-ira: no tax benefit to sell',
    },
  ],
  estimatedTaxSavings: 392.63,
  washSaleWarnings: [],
}

// The allocation Strategy derives for "bogleheads-three-fund" from the D4
// table + vehicle lookup — also what Tax consumes in demos 04–07.
export const expectedBogleheadsAllocation = {
  philosophy: 'bogleheads-three-fund',
  targets: [
    {
      assetClass: 'us-total-market',
      weightPct: 50,
      preferredVehicles: ['VTI', 'ITOT', 'SCHB'],
    },
    {
      assetClass: 'intl-developed',
      weightPct: 30,
      preferredVehicles: ['VXUS', 'IXUS'],
    },
    {
      assetClass: 'us-bonds',
      weightPct: 20,
      preferredVehicles: ['BND', 'AGG'],
    },
  ],
}
