import { describe, expect, it } from 'vitest'
import {
  expectedHappyCash,
  expectedHappyHoldings,
  garbagePaste,
  happyPathPaste,
  missingDatePaste,
} from '@wealth/schemas'
import { parseHoldings } from '../src/parser.js'

const fixedOptions = {
  clock: () => new Date('2026-07-29T00:00:00.000Z'),
  idFactory: () => 'fixed-uuid-0001',
}

describe('parseHoldings', () => {
  it('parses the canonical happy-path paste into the expected portfolio', () => {
    const { portfolio, warnings } = parseHoldings(happyPathPaste, fixedOptions)
    expect(portfolio).toEqual({
      portfolioId: 'pf-fixed-uu',
      asOf: '2026-07-29T00:00:00.000Z',
      holdings: expectedHappyHoldings,
      uninvestedCash: expectedHappyCash,
    })
    expect(warnings).toEqual([])
  })

  it('parses the missing-date variant with a null purchaseDate and a warning', () => {
    const { portfolio, warnings } = parseHoldings(
      missingDatePaste,
      fixedOptions,
    )
    const vti = portfolio.holdings.find((holding) => holding.symbol === 'VTI')
    expect(vti.lots[2]).toMatchObject({ lotId: 'VTI-003', purchaseDate: null })
    expect(warnings).toEqual([
      '1 of 3 VTI lots missing purchase dates — tax step may ask for them',
    ])
  })

  it('rejects garbage with the canonical holdings issue', () => {
    expect(() => parseHoldings(garbagePaste)).toThrow(
      /holdings: expected at least one recognizable symbol\/quantity pair/,
    )
    try {
      parseHoldings(garbagePaste)
    } catch (error) {
      expect(error.name).toBe('RequestMalformedError')
      expect(JSON.parse(error.metadata.issues)).toEqual([
        {
          path: ['holdings'],
          message: 'expected at least one recognizable symbol/quantity pair',
        },
      ])
    }
  })

  it('rejects symbols with no prices-v1 entry', () => {
    expect(() =>
      parseHoldings('Fidelity taxable account: 10 ZZZT @ $5 bought 2024-01-01'),
    ).toThrow(/no price available for symbol ZZZT/)
  })

  it('rejects positions without a recognizable cost', () => {
    expect(() =>
      parseHoldings(
        'Fidelity taxable account: 120 VTI bought at various times',
      ),
    ).toThrow(/missing cost for VTI/)
  })

  it('rejects unrecognized segments instead of guessing', () => {
    expect(() =>
      parseHoldings(
        'Fidelity taxable account: 40 AAPL @ $145, maybe some bonds too',
      ),
    ).toThrow(/unrecognized segment "maybe some bonds too"/)
  })

  it('supports avg-cost-only positions as a single undated lot', () => {
    const { portfolio, warnings } = parseHoldings(
      'Vanguard taxable account: 120 shares VTI avg cost $198, $12k cash.',
      fixedOptions,
    )
    expect(portfolio.holdings).toEqual([
      {
        accountId: 'vg-tax-001',
        accountType: 'taxable',
        symbol: 'VTI',
        lots: [
          {
            lotId: 'VTI-001',
            quantity: 120,
            costBasis: 198,
            purchaseDate: null,
          },
        ],
        currentPrice: 187.75,
        priceAsOf: '2026-07-28T16:00:00Z',
      },
    ])
    expect(portfolio.uninvestedCash).toEqual([
      { accountId: 'vg-tax-001', amount: 12000 },
    ])
    expect(warnings).toEqual([
      '1 of 1 VTI lots missing purchase dates — tax step may ask for them',
    ])
  })

  it('warns when lot quantities disagree with the stated position', () => {
    const { warnings } = parseHoldings(
      'Fidelity taxable account: 100 shares VTI avg cost $198 (lot 1: 50 @ $185 bought 2022-03-10, lot 2: 30 @ $204 bought 2023-08-21)',
      fixedOptions,
    )
    expect(warnings).toContain(
      'VTI: lot quantities sum to 80, stated position is 100',
    )
  })
})
