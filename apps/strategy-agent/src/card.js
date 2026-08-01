import { createAgentCard } from '@wealth/a2a-common'

export function strategyCardFor(baseUrl) {
  return createAgentCard({
    name: 'Strategy Agent',
    description:
      'Derives a target allocation from an investment philosophy via the D4 weights table, streaming progress over SSE',
    baseUrl,
    streaming: true,
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'derive-allocation',
        name: 'Derive Allocation',
        description:
          'Maps a philosophy (strategy-request-v1 data part, or an exact enum id as text) to an allocation-v1 artifact with preferred vehicles',
        tags: [
          'strategy',
          'allocation',
          'schema:strategy-request-v1',
          'produces:allocation-v1',
        ],
        examples: ['bogleheads-three-fund', 'all-weather'],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json'],
      },
    ],
  })
}
