import { requestMalformed } from '@wealth/a2a-common'
import { Allocation, philosophyTable, preferredVehicles } from '@wealth/schemas'

// D4: allocation is a pure lookup of the static philosophy→weights table plus
// the hardcoded vehicle lists (Research replaces the lookup in Slice 6). The
// only computation is validating custom weights.
export function deriveAllocation(request) {
  const { philosophy, customWeights } = request

  let weights
  if (philosophy === 'custom') {
    weights = customWeights ?? {}
    const entries = Object.entries(weights)
    const sum = entries.reduce((total, [, pct]) => total + pct, 0)
    if (entries.length === 0 || Math.abs(sum - 100) > 1e-9) {
      throw requestMalformed(
        'customWeights',
        `custom weights must sum to 100 (got ${sum || 'none'})`,
      )
    }
  } else {
    weights = philosophyTable[philosophy]
  }

  return Allocation.parse({
    philosophy,
    targets: Object.entries(weights).map(([assetClass, weightPct]) => ({
      assetClass,
      weightPct,
      preferredVehicles: preferredVehicles[assetClass],
    })),
  })
}
