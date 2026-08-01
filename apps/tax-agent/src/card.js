import { createAgentCard } from '@wealth/a2a-common'

// streaming: true is REQUIRED even though the primary flow is polling —
// SubscribeToTask (resubscribe) gates on the capability.
export function taxCardFor(baseUrl) {
  return createAgentCard({
    name: 'Tax Agent',
    description:
      'Lot-level tax-loss harvesting: long-running async task producing a wash-sale-safe execution-plan-v1 (greedy in Slice 0)',
    baseUrl,
    streaming: true,
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'optimize-tax',
        name: 'Tax Optimization',
        description:
          'Given standardized lots (tax-request-v1: portfolio-v1 + allocation-v1), produce a wash-sale-safe execution plan; may pause input-required for missing purchase dates (tax-followup-v1 replies)',
        tags: [
          'tax',
          'harvesting',
          'asset-location',
          'schema:tax-request-v1',
          'produces:execution-plan-v1',
        ],
        examples: [],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
  })
}
