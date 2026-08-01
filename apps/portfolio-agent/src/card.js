import { createAgentCard } from '@wealth/a2a-common'

// streaming: false is deliberate — the Orchestrator must handle a
// non-streaming peer, and streaming sends fail with -32004 (negative demo).
export function portfolioCardFor(baseUrl) {
  return createAgentCard({
    name: 'Portfolio Agent',
    description:
      'Standardizes messy pasted holdings into Zod-validated portfolio-v1 lots, stamping currentPrice/priceAsOf from the prices-v1 fixture',
    baseUrl,
    streaming: false,
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'standardize-holdings',
        name: 'Standardize Holdings',
        description:
          'Parses raw pasted account/lot text (text part, or a portfolio-request-v1 data part) into a portfolio-v1 artifact',
        tags: [
          'portfolio',
          'standardization',
          'schema:portfolio-request-v1',
          'produces:portfolio-v1',
        ],
        examples: [
          'Fidelity taxable account: 40 AAPL @ $145 bought 2021-06-02, $8,500 cash.',
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json'],
      },
    ],
  })
}
