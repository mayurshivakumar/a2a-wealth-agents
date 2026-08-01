import { describe, expect, it } from 'vitest'
import { expectedBogleheadsAllocation, philosophyTable } from '@wealth/schemas'
import { deriveAllocation } from '../src/allocator.js'

describe('deriveAllocation', () => {
  it('maps bogleheads-three-fund to the canonical allocation', () => {
    expect(deriveAllocation({ philosophy: 'bogleheads-three-fund' })).toEqual(
      expectedBogleheadsAllocation,
    )
  })

  it('produces a valid allocation summing to 100 for every table philosophy', () => {
    for (const philosophy of Object.keys(philosophyTable)) {
      const allocation = deriveAllocation({ philosophy })
      const sum = allocation.targets.reduce(
        (total, target) => total + target.weightPct,
        0,
      )
      expect(sum, philosophy).toBe(100)
      for (const target of allocation.targets) {
        expect(target.preferredVehicles.length).toBeGreaterThan(0)
      }
    }
  })

  it('accepts custom weights summing to 100', () => {
    const allocation = deriveAllocation({
      philosophy: 'custom',
      customWeights: { 'us-total-market': 70, 'us-bonds': 30 },
    })
    expect(allocation.targets).toEqual([
      {
        assetClass: 'us-total-market',
        weightPct: 70,
        preferredVehicles: ['VTI', 'ITOT', 'SCHB'],
      },
      {
        assetClass: 'us-bonds',
        weightPct: 30,
        preferredVehicles: ['BND', 'AGG'],
      },
    ])
  })

  it('rejects custom weights that do not sum to 100', () => {
    expect(() =>
      deriveAllocation({
        philosophy: 'custom',
        customWeights: { 'us-total-market': 60 },
      }),
    ).toThrow(/must sum to 100/)
    expect(() => deriveAllocation({ philosophy: 'custom' })).toThrow(
      /must sum to 100/,
    )
  })
})
