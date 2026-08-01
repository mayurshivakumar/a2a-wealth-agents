import {
  LONG_TERM_HOLDING_DAYS,
  preferredVehicles as staticVehicles,
  pricesV1,
  symbolAssetClass,
  taxRateDefaults,
} from '@wealth/schemas'

// Slice 0's greedy tax-loss harvester (the LP arrives in Slice T; this stays
// as the permanent fallback). Pure function of its inputs — all date math is
// UTC relative to portfolio.asOf, never wall-clock. Wash-sale semantics are
// simplified same-symbol-only per design/errata.md §3.

const DAY_MS = 24 * 60 * 60 * 1000
const WASH_SALE_WINDOW_DAYS = 30

function money(amount) {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function roundCents(amount) {
  return Math.round(amount * 100) / 100
}

function daysBetween(fromIsoDate, toMs) {
  return Math.floor((toMs - Date.parse(`${fromIsoDate}T00:00:00Z`)) / DAY_MS)
}

/**
 * Runs the greedy pass over a validated tax-request-v1.
 *
 * Returns one of:
 *   { kind: 'input-required', lotId, question }  — first LOSS lot missing its
 *       purchase date (rule: dates are only demanded for lots the harvest
 *       actually needs; callers loop until none remain)
 *   { kind: 'failed', reason }                   — no wash-sale-safe replacement
 *   { kind: 'plan', plan }                       — an execution-plan-v1 payload
 */
export function harvest({
  portfolio,
  allocation,
  rates = taxRateDefaults,
  prices = pricesV1,
  vehicles = staticVehicles,
}) {
  const asOfMs = Date.parse(portfolio.asOf)
  const warnings = []
  const sells = []
  const holds = []

  // Every lot of a symbol, for the recent-purchase wash-sale check.
  const lotsBySymbol = new Map()
  for (const holding of portfolio.holdings) {
    if (!lotsBySymbol.has(holding.symbol)) lotsBySymbol.set(holding.symbol, [])
    lotsBySymbol.get(holding.symbol).push(...holding.lots)
  }

  for (const holding of portfolio.holdings) {
    if (holding.accountType !== 'taxable') {
      holds.push({
        type: 'hold',
        accountId: holding.accountId,
        symbol: holding.symbol,
        quantity: holding.lots.reduce((sum, lot) => sum + lot.quantity, 0),
        reason: `${holding.accountType}: no tax benefit to sell`,
      })
      continue
    }

    for (const lot of holding.lots) {
      const isLoss = holding.currentPrice < lot.costBasis
      if (!isLoss) continue

      // A loss lot without a purchase date blocks the whole evaluation:
      // holding period AND the wash-sale window need it.
      if (lot.purchaseDate === null) {
        return {
          kind: 'input-required',
          lotId: lot.lotId,
          question: `Purchase date for lot ${lot.lotId} (${lot.quantity} shares @ $${lot.costBasis})?`,
        }
      }

      // Same-symbol wash-sale: replacement shares already exist if ANOTHER
      // lot of this symbol was purchased within the window before asOf.
      const recentOther = lotsBySymbol
        .get(holding.symbol)
        .find(
          (other) =>
            other.lotId !== lot.lotId &&
            other.purchaseDate !== null &&
            daysBetween(other.purchaseDate, asOfMs) <= WASH_SALE_WINDOW_DAYS &&
            daysBetween(other.purchaseDate, asOfMs) >= 0,
        )
      if (recentOther) {
        warnings.push(
          `${lot.lotId}: skipped — ${holding.symbol} was purchased within ${WASH_SALE_WINDOW_DAYS} days of asOf (lot ${recentOther.lotId}); selling would trigger a wash sale`,
        )
        continue
      }

      const loss = (lot.costBasis - holding.currentPrice) * lot.quantity
      const longTerm =
        daysBetween(lot.purchaseDate, asOfMs) > LONG_TERM_HOLDING_DAYS
      sells.push({
        action: {
          type: 'sell',
          accountId: holding.accountId,
          symbol: holding.symbol,
          lotId: lot.lotId,
          quantity: lot.quantity,
          reason: `Harvest $${money(loss)} loss`,
        },
        loss,
        longTerm,
        proceeds: lot.quantity * holding.currentPrice,
        assetClass: symbolAssetClass[holding.symbol],
      })
    }
  }

  // Replacement buys: pool proceeds per asset class, buy the first preferred
  // vehicle that is not a sold symbol (same-symbol rule) and has a price.
  const soldSymbols = new Set(sells.map((sell) => sell.action.symbol))
  const buys = []
  const byClass = new Map()
  for (const sell of sells) {
    if (!sell.assetClass) {
      warnings.push(
        `${sell.action.symbol}: no asset-class mapping — proceeds not redeployed`,
      )
      continue
    }
    if (!byClass.has(sell.assetClass)) {
      byClass.set(sell.assetClass, {
        proceeds: 0,
        accountId: sell.action.accountId,
        symbols: new Set(),
      })
    }
    const bucket = byClass.get(sell.assetClass)
    bucket.proceeds += sell.proceeds
    bucket.symbols.add(sell.action.symbol)
  }

  for (const [assetClass, bucket] of byClass) {
    const target = allocation.targets.find(
      (entry) => entry.assetClass === assetClass,
    )
    const candidates = target?.preferredVehicles ?? vehicles[assetClass] ?? []
    const replacement = candidates.find(
      (vehicle) => !soldSymbols.has(vehicle) && prices[vehicle],
    )
    if (!replacement) {
      return {
        kind: 'failed',
        reason: `no wash-sale-safe replacement available for ${assetClass}: every candidate (${candidates.join(', ') || 'none'}) conflicts with a harvested symbol`,
      }
    }
    const quantity = Math.floor(bucket.proceeds / prices[replacement].price)
    if (quantity >= 1) {
      buys.push({
        type: 'buy',
        accountId: bucket.accountId,
        symbol: replacement,
        quantity,
        reason: `Replacement for ${assetClass}; avoids wash-sale on ${[...bucket.symbols].sort().join('/')}`,
      })
    }
  }

  const estimatedTaxSavings = roundCents(
    sells.reduce(
      (total, sell) =>
        total +
        sell.loss *
          ((sell.longTerm ? rates.ltcgRatePct : rates.marginalRatePct) / 100),
      0,
    ),
  )

  const actions = [...sells.map((sell) => sell.action), ...buys, ...holds]
  if (actions.length === 0) {
    // Degenerate no-op portfolio (all-taxable, all gains): report holds so
    // the plan stays schema-valid.
    for (const holding of portfolio.holdings) {
      actions.push({
        type: 'hold',
        accountId: holding.accountId,
        symbol: holding.symbol,
        quantity: holding.lots.reduce((sum, lot) => sum + lot.quantity, 0),
        reason: 'no harvestable loss',
      })
    }
  }

  return {
    kind: 'plan',
    plan: { actions, estimatedTaxSavings, washSaleWarnings: warnings },
  }
}
