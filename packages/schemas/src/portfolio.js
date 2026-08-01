import { z } from 'zod'

export const AccountType = z.enum([
  'taxable',
  'traditional-ira',
  'roth-ira',
  '401k',
])

export const Lot = z.object({
  lotId: z.string().min(1),
  quantity: z.number().positive(),
  // Cost basis is per share.
  costBasis: z.number().positive(),
  // null triggers input-required downstream (Tax cannot evaluate holding period
  // or the wash-sale window without it).
  purchaseDate: z.iso.date().nullable(),
})

export const Holding = z.object({
  accountId: z.string().min(1),
  accountType: AccountType,
  symbol: z.string().regex(/^[A-Z][A-Z0-9.]{0,5}$/),
  lots: z.array(Lot).min(1),
  // D1: stamped by the Portfolio Agent from the prices-v1 fixture at standardization time.
  currentPrice: z.number().positive(),
  priceAsOf: z.iso.datetime(),
})

export const Portfolio = z.object({
  portfolioId: z.string().min(1),
  asOf: z.iso.datetime(),
  holdings: z.array(Holding).min(1),
  uninvestedCash: z.array(
    z.object({
      accountId: z.string().min(1),
      amount: z.number().nonnegative(),
    }),
  ),
})
