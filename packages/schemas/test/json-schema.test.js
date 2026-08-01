import { describe, expect, it } from 'vitest'
import {
  AssetClass,
  PhilosophyId,
  Prices,
  philosophyTable,
  preferredVehicles,
  pricesV1,
  schemaNames,
  symbolAssetClass,
  toJsonSchema,
} from '../src/index.js'

describe('JSON-schema exports', () => {
  for (const name of schemaNames()) {
    it(`${name} export is stable`, () => {
      expect(toJsonSchema(name)).toMatchSnapshot()
    })
  }

  it('rejects unknown schema names', () => {
    expect(() => toJsonSchema('portfolio-v9')).toThrow(/Unknown schema/)
  })
})

describe('static tables', () => {
  it('prices-v1 fixture satisfies its own schema', () => {
    expect(() => Prices.parse(pricesV1)).not.toThrow()
  })

  it('every non-custom philosophy has weights summing to 100', () => {
    const ids = PhilosophyId.options.filter((id) => id !== 'custom')
    expect(Object.keys(philosophyTable).sort()).toEqual([...ids].sort())
    for (const [id, weights] of Object.entries(philosophyTable)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0)
      expect(sum, `${id} weights must sum to 100`).toBe(100)
    }
  })

  it('philosophy weights and vehicle lists only use known asset classes', () => {
    for (const weights of Object.values(philosophyTable)) {
      for (const assetClass of Object.keys(weights)) {
        expect(AssetClass.options).toContain(assetClass)
      }
    }
    expect(Object.keys(preferredVehicles).sort()).toEqual(
      [...AssetClass.options].sort(),
    )
  })

  it('every demo asset class has vehicles priced in prices-v1', () => {
    for (const assetClass of [
      'us-total-market',
      'intl-developed',
      'us-bonds',
    ]) {
      for (const symbol of preferredVehicles[assetClass]) {
        expect(pricesV1[symbol], `${symbol} needs a price`).toBeDefined()
      }
    }
  })

  it('symbolAssetClass classifies every priced symbol', () => {
    for (const symbol of Object.keys(pricesV1)) {
      expect(AssetClass.options, `${symbol} needs an asset class`).toContain(
        symbolAssetClass[symbol],
      )
    }
  })
})
