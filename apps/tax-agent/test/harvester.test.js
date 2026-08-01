import { describe, expect, it } from 'vitest'
import {
  expectedBogleheadsAllocation,
  expectedHappyCash,
  expectedHappyHoldings,
  expectedHappyPlan,
} from '@wealth/schemas'
import { harvest } from '../src/harvester.js'

const AS_OF = '2026-07-29T00:00:00.000Z'

function happyPortfolio() {
  return {
    portfolioId: 'pf-test',
    asOf: AS_OF,
    holdings: structuredClone(expectedHappyHoldings),
    uninvestedCash: structuredClone(expectedHappyCash),
  }
}

function run(portfolio, allocation = expectedBogleheadsAllocation) {
  return harvest({ portfolio, allocation })
}

function miniPortfolio(lots, { symbol = 'VTI', currentPrice = 187.75 } = {}) {
  return {
    portfolioId: 'pf-mini',
    asOf: AS_OF,
    holdings: [
      {
        accountId: 'fid-tax-001',
        accountType: 'taxable',
        symbol,
        lots,
        currentPrice,
        priceAsOf: '2026-07-28T16:00:00Z',
      },
    ],
    uninvestedCash: [],
  }
}

describe('harvest', () => {
  it('produces the canonical happy-path plan', () => {
    const outcome = run(happyPortfolio())
    expect(outcome.kind).toBe('plan')
    expect(outcome.plan).toEqual(expectedHappyPlan)
  })

  it('pauses input-required on the first undated LOSS lot with the transcript question', () => {
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[2].purchaseDate = null // VTI-003, a loss lot
    const outcome = run(portfolio)
    expect(outcome).toEqual({
      kind: 'input-required',
      lotId: 'VTI-003',
      question: 'Purchase date for lot VTI-003 (40 shares @ $210)?',
    })
  })

  it('never asks for dates on gain lots', () => {
    const portfolio = happyPortfolio()
    portfolio.holdings[0].lots[0].purchaseDate = null // VTI-001 is a gain lot
    const outcome = run(portfolio)
    expect(outcome.kind).toBe('plan')
  })

  it('applies 24% to short-term and 15% to long-term losses', () => {
    // Loss per lot: (204 - 187.75) × 10 = 162.50
    const shortTerm = run(
      miniPortfolio([
        {
          lotId: 'VTI-001',
          quantity: 10,
          costBasis: 204,
          purchaseDate: '2026-05-01',
        },
      ]),
    )
    expect(shortTerm.plan.estimatedTaxSavings).toBe(39) // 162.50 × 0.24

    const longTerm = run(
      miniPortfolio([
        {
          lotId: 'VTI-001',
          quantity: 10,
          costBasis: 204,
          purchaseDate: '2024-01-01',
        },
      ]),
    )
    expect(longTerm.plan.estimatedTaxSavings).toBe(24.38) // 162.50 × 0.15, rounded
  })

  it('blocks a sale when another same-symbol lot was bought within 30 days of asOf', () => {
    const blocked = run(
      miniPortfolio([
        {
          lotId: 'VTI-001',
          quantity: 10,
          costBasis: 204,
          purchaseDate: '2024-01-01',
        },
        {
          lotId: 'VTI-002',
          quantity: 5,
          costBasis: 150,
          purchaseDate: '2026-06-29',
        }, // gain, 30 days before asOf
      ]),
    )
    expect(blocked.kind).toBe('plan')
    expect(blocked.plan.washSaleWarnings).toEqual([
      'VTI-001: skipped — VTI was purchased within 30 days of asOf (lot VTI-002); selling would trigger a wash sale',
    ])
    expect(blocked.plan.actions.filter((a) => a.type === 'sell')).toHaveLength(
      0,
    )

    const notBlocked = run(
      miniPortfolio([
        {
          lotId: 'VTI-001',
          quantity: 10,
          costBasis: 204,
          purchaseDate: '2024-01-01',
        },
        {
          lotId: 'VTI-002',
          quantity: 5,
          costBasis: 150,
          purchaseDate: '2026-06-28',
        }, // 31 days before
      ]),
    )
    expect(notBlocked.plan.washSaleWarnings).toEqual([])
    expect(
      notBlocked.plan.actions.filter((a) => a.type === 'sell'),
    ).toHaveLength(1)
  })

  it('fails when every replacement candidate conflicts with a sold symbol', () => {
    const outcome = run(happyPortfolio(), {
      philosophy: 'custom',
      targets: [
        // AAPL and VTI both map to us-total-market and both get sold.
        {
          assetClass: 'us-total-market',
          weightPct: 100,
          preferredVehicles: ['VTI', 'AAPL'],
        },
      ],
    })
    expect(outcome.kind).toBe('failed')
    expect(outcome.reason).toMatch(
      /no wash-sale-safe replacement available for us-total-market/,
    )
  })

  it('holds tax-advantaged positions and reports holds for no-loss portfolios', () => {
    const outcome = run(happyPortfolio())
    const holds = outcome.plan.actions.filter(
      (action) => action.type === 'hold',
    )
    expect(holds).toEqual([
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
    ])

    const noLoss = run(
      miniPortfolio([
        {
          lotId: 'VTI-001',
          quantity: 10,
          costBasis: 100,
          purchaseDate: '2024-01-01',
        },
      ]),
    )
    expect(noLoss.plan).toEqual({
      actions: [
        {
          type: 'hold',
          accountId: 'fid-tax-001',
          symbol: 'VTI',
          quantity: 10,
          reason: 'no harvestable loss',
        },
      ],
      estimatedTaxSavings: 0,
      washSaleWarnings: [],
    })
  })
})
