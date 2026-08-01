import { PhilosophyId } from '@wealth/schemas'

// D4's no-LLM mode: a deterministic keyword matcher replaces free-text
// extraction. Everything below the tool boundary (a2a-actions) is identical
// to LLM mode. Unmatched philosophy text is forwarded to Strategy verbatim,
// which rejects it with RequestMalformedError — the documented error surface.

const PHILOSOPHY_KEYWORDS = [
  {
    philosophy: 'bogleheads-three-fund',
    patterns: [/^1$/, /bogle/i, /three[\s-]?fund/i],
  },
  { philosophy: 'esg-tilt', patterns: [/^2$/, /esg/i, /sustainab/i] },
  { philosophy: 'dividend-growth', patterns: [/^3$/, /dividend/i, /income/i] },
  {
    philosophy: 'all-weather',
    patterns: [/^4$/, /all[\s-]?weather/i, /risk parity/i],
  },
]

export function matchPhilosophy(text) {
  const trimmed = text.trim()
  const exact = PhilosophyId.safeParse(trimmed.toLowerCase())
  if (exact.success && exact.data !== 'custom') return exact.data
  for (const { philosophy, patterns } of PHILOSOPHY_KEYWORDS) {
    if (patterns.some((pattern) => pattern.test(trimmed))) return philosophy
  }
  return undefined
}

export const philosophyMenu = [
  '  1) Bogleheads three-fund   2) ESG tilt   3) Dividend growth',
  '  4) All-weather             (custom weights need LLM mode)',
].join('\n')

const MONTHS = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

/**
 * Deterministically parses the two date shapes the transcripts use:
 * "2024-03-15" and "March 15, 2024". Returns an ISO date or undefined —
 * no Date() heuristics, no timezone surprises.
 */
export function parsePlainDate(text) {
  const trimmed = text.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return trimmed
  const written = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (written) {
    const month = MONTHS[written[1].toLowerCase()]
    if (!month) return undefined
    return `${written[3]}-${month}-${written[2].padStart(2, '0')}`
  }
  return undefined
}

export function isAffirmative(text) {
  return /^(y|yes|yep|sure|ok|go)$/i.test(text.trim())
}

export function isNegative(text) {
  return /^(n|no|nope|skip)$/i.test(text.trim())
}
