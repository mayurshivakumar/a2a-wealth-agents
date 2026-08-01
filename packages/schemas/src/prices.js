import { z } from 'zod'

export const PriceEntry = z.object({
  price: z.number().positive(),
  asOf: z.iso.datetime(),
})

export const Prices = z.record(z.string(), PriceEntry)

// D1: the static price fixture — the deterministic source for tests and --scripted mode.
// The Portfolio Agent stamps currentPrice/priceAsOf from here at standardization time.
// Live quotes become an optional enrichment in Slice 9; this table remains the fallback.
const asOf = '2026-07-28T16:00:00Z'

export const pricesV1 = {
  VTI: { price: 187.75, asOf },
  AAPL: { price: 114.0, asOf },
  VXUS: { price: 61.5, asOf },
  BND: { price: 68.25, asOf },
  ITOT: { price: 92.1, asOf },
  SCHB: { price: 21.55, asOf },
  IXUS: { price: 71.4, asOf },
  AGG: { price: 96.8, asOf },
}

export function priceFor(symbol) {
  return pricesV1[symbol]
}
