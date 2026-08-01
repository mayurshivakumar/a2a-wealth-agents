import { z } from 'zod'
import { Allocation } from './allocation.js'
import { ArtifactRef } from './artifact-ref.js'
import { ExecutionPlan } from './execution-plan.js'
import { Portfolio } from './portfolio.js'
import { Prices } from './prices.js'
import {
  PortfolioRequest,
  StrategyRequest,
  TaxFollowup,
  TaxRequest,
} from './requests.js'

// Registry of every versioned wire contract, keyed by its wire-form name.
// Contracts evolve by adding a new *-vN entry, never by mutating an existing one.
export const schemaRegistry = {
  'portfolio-v1': Portfolio,
  'allocation-v1': Allocation,
  'execution-plan-v1': ExecutionPlan,
  'portfolio-request-v1': PortfolioRequest,
  'strategy-request-v1': StrategyRequest,
  'tax-request-v1': TaxRequest,
  'tax-followup-v1': TaxFollowup,
  'artifact-ref-v1': ArtifactRef,
  'prices-v1': Prices,
}

export function schemaNames() {
  return Object.keys(schemaRegistry)
}

export function schemaFor(name) {
  const schema = schemaRegistry[name]
  if (!schema) throw new Error(`Unknown schema: ${name}`)
  return schema
}

// JSON-schema export consumed by each server's GET /schemas/{name}.json endpoint;
// the matching skill advertises the name via a `schema:`/`produces:` tag on its card.
export function toJsonSchema(name) {
  return z.toJSONSchema(schemaFor(name))
}
