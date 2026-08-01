// D3: flat tax assumptions, hardcoded defaults used whenever the user supplies nothing.
// The tax-profile-v1 schema and the /taxprofile override arrive in Slice T; until then the
// greedy harvester's savings estimate always uses these values.
export const taxRateDefaults = {
  filingStatus: 'single',
  marginalRatePct: 24,
  ltcgRatePct: 15,
  statePct: 0,
}

// Holding period boundary: strictly more than one year counts as long-term.
export const LONG_TERM_HOLDING_DAYS = 365
