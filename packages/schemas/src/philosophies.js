import { z } from 'zod'

// D4: closed philosophy enum. Free-text extraction happens in the Orchestrator
// (LLM, or keyword matcher in --scripted mode) — Strategy only ever sees these ids.
export const PhilosophyId = z.enum([
  'bogleheads-three-fund',
  'esg-tilt',
  'dividend-growth',
  'all-weather',
  'custom',
])

export const AssetClass = z.enum([
  'us-total-market',
  'intl-developed',
  'us-bonds',
  'esg-thematic',
  'gold',
  'commodities',
])

// D4: static philosophy → target-weights table owned by Strategy. Weights sum to 100.
export const philosophyTable = {
  'bogleheads-three-fund': {
    'us-total-market': 50,
    'intl-developed': 30,
    'us-bonds': 20,
  },
  'esg-tilt': {
    'us-total-market': 45,
    'intl-developed': 30,
    'us-bonds': 20,
    'esg-thematic': 5,
  },
  'dividend-growth': {
    'us-total-market': 60,
    'intl-developed': 20,
    'us-bonds': 20,
  },
  'all-weather': {
    'us-total-market': 30,
    'intl-developed': 15,
    'us-bonds': 40,
    gold: 7.5,
    commodities: 7.5,
  },
}

// Slice 0 stand-in for Research (Slice 5): a hardcoded vehicle lookup per asset class,
// ordered by preference. The Tax Agent picks replacement buys from these lists.
export const preferredVehicles = {
  'us-total-market': ['VTI', 'ITOT', 'SCHB'],
  'intl-developed': ['VXUS', 'IXUS'],
  'us-bonds': ['BND', 'AGG'],
  'esg-thematic': ['ESGV', 'SUSA'],
  gold: ['GLD', 'IAU'],
  commodities: ['DBC', 'PDBC'],
}

// Deterministic symbol → asset-class mapping for every symbol the fixtures can produce.
// Individual US stocks (AAPL) count as US equity for replacement purposes.
export const symbolAssetClass = {
  VTI: 'us-total-market',
  ITOT: 'us-total-market',
  SCHB: 'us-total-market',
  AAPL: 'us-total-market',
  VXUS: 'intl-developed',
  IXUS: 'intl-developed',
  BND: 'us-bonds',
  AGG: 'us-bonds',
}

export const philosophyDisplayNames = {
  'bogleheads-three-fund': 'Bogleheads three-fund',
  'esg-tilt': 'ESG tilt',
  'dividend-growth': 'Dividend growth',
  'all-weather': 'All-weather',
  custom: 'Custom',
}
