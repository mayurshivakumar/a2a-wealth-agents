import { z } from 'zod'
import { AssetClass } from './philosophies.js'

export const AllocationTarget = z.object({
  assetClass: AssetClass,
  weightPct: z.number().min(0).max(100),
  preferredVehicles: z.array(z.string().min(1)).min(1),
})

// Target weights must sum to 100 — enforced by the Strategy allocator (and its tests),
// not by the schema, so the JSON-schema export stays representable.
export const Allocation = z.object({
  philosophy: z.string().min(1),
  targets: z.array(AllocationTarget).min(1),
})
