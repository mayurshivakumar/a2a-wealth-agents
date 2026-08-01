import { z } from 'zod'

export const PlanAction = z.object({
  type: z.enum(['sell', 'buy', 'hold']),
  accountId: z.string().min(1),
  symbol: z.string().min(1),
  // Present on lot-level sells; buys and holds are position-level.
  lotId: z.string().min(1).optional(),
  quantity: z.number().positive(),
  reason: z.string().min(1),
})

export const ExecutionPlan = z.object({
  actions: z.array(PlanAction).min(1),
  estimatedTaxSavings: z.number().nonnegative(),
  washSaleWarnings: z.array(z.string()),
})
