import { randomUUID } from 'node:crypto'
import { requestMalformed, requestMalformedFromZod } from '@wealth/a2a-common'
import { pricesV1 } from '@wealth/schemas'

// Deterministic parser for the fixed holdings grammar (see design/errata.md):
//   <Institution> <account type>[ account]: <chunk>, <chunk>, …
//   chunk = "<qty> [shares [of ]]<SYMBOL> [@ $cost | avg cost $cost]
//            [(lot 1: <qty> @ $cost [bought YYYY-MM-DD], …)] [bought YYYY-MM-DD]"
//         | "$<amount>[k] cash"
// Anything else is rejected with RequestMalformedError so the boundary stays
// honest — there is deliberately no LLM in this process.

const ACCOUNT_HEADER =
  /\b(Fidelity|Vanguard|Schwab)\s+(taxable|Roth\s+IRA|Roth|Traditional\s+IRA|Traditional|401\(?k\)?)(?:\s+account)?\s*:/gi

const POSITION =
  /^(\d+(?:\.\d+)?)\s+(?:shares?\s+(?:of\s+)?)?([A-Z][A-Z0-9.]{0,5})\b\s*(.*)$/
const LOT_ENTRY =
  /^lot\s*\d+\s*:\s*(\d+(?:\.\d+)?)\s*@\s*\$?([\d,]+(?:\.\d{1,2})?)(?:\s+bought\s+(\d{4}-\d{2}-\d{2}))?$/i
const CASH = /^\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\s+(?:in\s+)?cash$/i
const AT_COST = /@\s*\$?([\d,]+(?:\.\d{1,2})?)/
const AVG_COST = /avg\.?\s+cost\s+\$?([\d,]+(?:\.\d{1,2})?)/i
const BOUGHT = /bought\s+(\d{4}-\d{2}-\d{2})/i
// eslint-disable-next-line no-control-regex -- NUL is this parser's private lot-group sentinel
const LOT_GROUP_TOKEN = /\u0000(\d+)\u0000/

const INSTITUTION_PREFIX = { fidelity: 'fid', vanguard: 'vg', schwab: 'sch' }
const ACCOUNT_TYPES = {
  taxable: { type: 'taxable', short: 'tax' },
  roth: { type: 'roth-ira', short: 'roth' },
  'roth ira': { type: 'roth-ira', short: 'roth' },
  traditional: { type: 'traditional-ira', short: 'trad' },
  'traditional ira': { type: 'traditional-ira', short: 'trad' },
  '401k': { type: '401k', short: '401k' },
  '401(k)': { type: '401k', short: '401k' },
}

const NO_HOLDINGS = 'expected at least one recognizable symbol/quantity pair'

function money(raw) {
  return Number(raw.replaceAll(',', ''))
}

function splitAccountSections(text) {
  const headers = [...text.matchAll(ACCOUNT_HEADER)]
  if (headers.length === 0) {
    throw requestMalformed('holdings', NO_HOLDINGS)
  }
  return headers.map((match, index) => {
    const institution = match[1].toLowerCase()
    const typeKey = match[2].toLowerCase().replace(/\s+/g, ' ')
    const nextStart = headers[index + 1]?.index ?? text.length
    return {
      institution,
      typeInfo: ACCOUNT_TYPES[typeKey],
      body: text.slice(match.index + match[0].length, nextStart).trim(),
    }
  })
}

function parseLots(rest, lotGroups, symbol) {
  const groupMatch = rest.match(LOT_GROUP_TOKEN)
  if (groupMatch) {
    const entries = lotGroups[Number(groupMatch[1])]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    return entries.map((entry) => {
      const lot = entry.match(LOT_ENTRY)
      if (!lot) {
        throw requestMalformed(
          'holdings',
          `unrecognized lot entry "${entry}" for ${symbol}`,
        )
      }
      return {
        quantity: Number(lot[1]),
        costBasis: money(lot[2]),
        purchaseDate: lot[3] ?? null,
      }
    })
  }
  const cost = rest.match(AVG_COST) ?? rest.match(AT_COST)
  if (!cost) {
    throw requestMalformed(
      'holdings',
      `missing cost for ${symbol} — expected "@ $price" or "avg cost $price"`,
    )
  }
  return [
    {
      quantity: null, // filled from the stated position quantity by the caller
      costBasis: money(cost[1]),
      purchaseDate: rest.match(BOUGHT)?.[1] ?? null,
    },
  ]
}

function parseSection(section, lotGroups) {
  const positions = []
  let cash = 0
  const chunks = section
    .split(',')
    .map((chunk) => chunk.replace(/\.+$/, '').trim())
    .filter(Boolean)

  for (const chunk of chunks) {
    const cashMatch = chunk.match(CASH)
    if (cashMatch) {
      cash += money(cashMatch[1]) * (cashMatch[2] ? 1000 : 1)
      continue
    }
    const position = chunk.match(POSITION)
    if (!position) {
      throw requestMalformed('holdings', `unrecognized segment "${chunk}"`)
    }
    const [, quantityRaw, symbol, rest] = position
    const statedQuantity = Number(quantityRaw)
    const lots = parseLots(rest, lotGroups, symbol).map((lot) => ({
      ...lot,
      quantity: lot.quantity ?? statedQuantity,
    }))
    positions.push({ symbol, statedQuantity, lots })
  }
  return { positions, cash }
}

export function parseHoldings(
  rawText,
  { prices = pricesV1, clock = () => new Date(), idFactory = randomUUID } = {},
) {
  const lotGroups = []
  const text = rawText
    .replaceAll('\u0000', '')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip thousands-separator commas ("$8,500" → "$8500") so chunking on
    // commas never splits inside a money amount.
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/\(([^)]*)\)/g, (_, inner) => {
      lotGroups.push(inner)
      return `\u0000${lotGroups.length - 1}\u0000`
    })

  const sections = splitAccountSections(text)
  const warnings = []
  const holdings = []
  const uninvestedCash = []
  const accountCounters = {}
  const lotCounters = {}
  const holdingByKey = new Map()

  for (const section of sections) {
    const prefix = INSTITUTION_PREFIX[section.institution]
    const { type, short } = section.typeInfo
    const accountKey = `${prefix}-${short}`
    accountCounters[accountKey] = (accountCounters[accountKey] ?? 0) + 1
    const accountId = `${accountKey}-${String(accountCounters[accountKey]).padStart(3, '0')}`

    const { positions, cash } = parseSection(section.body, lotGroups)
    if (cash > 0) uninvestedCash.push({ accountId, amount: cash })

    for (const { symbol, statedQuantity, lots } of positions) {
      const lotsWithIds = lots.map((lot) => {
        lotCounters[symbol] = (lotCounters[symbol] ?? 0) + 1
        return {
          lotId: `${symbol}-${String(lotCounters[symbol]).padStart(3, '0')}`,
          quantity: lot.quantity,
          costBasis: lot.costBasis,
          purchaseDate: lot.purchaseDate,
        }
      })
      const lotSum = lotsWithIds.reduce((sum, lot) => sum + lot.quantity, 0)
      if (lotsWithIds.length > 1 && lotSum !== statedQuantity) {
        warnings.push(
          `${symbol}: lot quantities sum to ${lotSum}, stated position is ${statedQuantity}`,
        )
      }
      const key = `${accountId}/${symbol}`
      const existing = holdingByKey.get(key)
      if (existing) {
        existing.lots.push(...lotsWithIds)
      } else {
        const holding = {
          accountId,
          accountType: type,
          symbol,
          lots: lotsWithIds,
        }
        holdingByKey.set(key, holding)
        holdings.push(holding)
      }
    }
  }

  if (holdings.length === 0) {
    throw requestMalformed('holdings', NO_HOLDINGS)
  }

  const unknownSymbols = [...new Set(holdings.map((h) => h.symbol))].filter(
    (symbol) => !prices[symbol],
  )
  if (unknownSymbols.length > 0) {
    throw requestMalformedFromZod(
      unknownSymbols.map((symbol) => ({
        path: ['holdings'],
        message: `no price available for symbol ${symbol} (prices-v1 covers: ${Object.keys(prices).join(', ')})`,
      })),
    )
  }

  for (const holding of holdings) {
    const { price, asOf } = prices[holding.symbol]
    holding.currentPrice = price
    holding.priceAsOf = asOf
    const missing = holding.lots.filter(
      (lot) => lot.purchaseDate === null,
    ).length
    if (missing > 0) {
      warnings.push(
        `${missing} of ${holding.lots.length} ${holding.symbol} lots missing purchase dates — tax step may ask for them`,
      )
    }
  }

  return {
    portfolio: {
      portfolioId: `pf-${String(idFactory()).slice(0, 8)}`,
      asOf: clock().toISOString(),
      holdings,
      uninvestedCash,
    },
    warnings,
  }
}
