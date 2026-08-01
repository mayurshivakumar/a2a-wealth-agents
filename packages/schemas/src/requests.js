import { z } from 'zod'
import { Allocation } from './allocation.js'
import { AssetClass, PhilosophyId } from './philosophies.js'
import { Portfolio } from './portfolio.js'

// Inbound contract of the Portfolio Agent. The messy user paste travels either as a
// text Part (wrapped into { rawText } by the executor) or as a data Part of this shape —
// the one place raw pre-standardization text is allowed into the mesh.
export const PortfolioRequest = z.object({
  rawText: z.string().min(1),
})

export const StrategyConstraints = z.object({
  maxExpenseRatioPct: z.number().positive().optional(),
  excludeSectors: z.array(z.string().min(1)).optional(),
  preferredDomiciles: z.array(z.string().min(1)).optional(),
})

// Inbound contract of the Strategy Agent. When philosophy is "custom", customWeights
// is required and must sum to 100 — enforced by the allocator, not the schema.
export const StrategyRequest = z.object({
  philosophy: PhilosophyId,
  customWeights: z
    .partialRecord(AssetClass, z.number().min(0).max(100))
    .optional(),
  constraints: StrategyConstraints.optional(),
})

// Inbound contract of the Tax Agent.
export const TaxRequest = z.object({
  portfolio: Portfolio,
  allocation: Allocation,
})

// Follow-up reply continuing an input-required Tax task on the same taskId.
export const TaxFollowup = z.object({
  lotId: z.string().min(1),
  purchaseDate: z.iso.date(),
})
