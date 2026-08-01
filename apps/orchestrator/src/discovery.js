import { skillSchemas } from '@wealth/a2a-common'

// What each agent's card must advertise before the Orchestrator will route to
// it — the docs' "schema compatibility check", realized as skill tags (see
// design/errata.md §3).
export const AGENT_EXPECTATIONS = {
  portfolio: {
    skillTag: 'portfolio',
    inputSchema: 'portfolio-request-v1',
    outputSchema: 'portfolio-v1',
  },
  strategy: {
    skillTag: 'strategy',
    inputSchema: 'strategy-request-v1',
    outputSchema: 'allocation-v1',
  },
  tax: {
    skillTag: 'tax',
    inputSchema: 'tax-request-v1',
    outputSchema: 'execution-plan-v1',
  },
}

/**
 * Fetches every agent's card, validates the protocol version and schema
 * tags, and indexes skills by tag. An unreachable or incompatible agent is
 * marked offline with a reason — never a crash (graceful degradation).
 */
export async function discoverAgents({ urls, factory, logger }) {
  const agents = {}

  for (const [name, expectation] of Object.entries(AGENT_EXPECTATIONS)) {
    const url = urls[name]
    try {
      const client = await factory.createFromUrl(url)
      const card = await client.getAgentCard()

      const hasV1Interface = (card.supportedInterfaces ?? []).some(
        (candidate) =>
          candidate.protocolBinding === 'JSONRPC' &&
          candidate.protocolVersion === '1.0',
      )
      if (!hasV1Interface) {
        const versions = (card.supportedInterfaces ?? [])
          .map((candidate) => candidate.protocolVersion)
          .join(', ')
        throw new Error(`speaks A2A ${versions || '(none)'}, need 1.0`)
      }

      const skill = (card.skills ?? []).find((candidate) => {
        const schemas = skillSchemas(candidate)
        return (
          schemas.input === expectation.inputSchema &&
          schemas.output === expectation.outputSchema
        )
      })
      if (!skill) {
        throw new Error(
          `no skill advertises schema:${expectation.inputSchema} → produces:${expectation.outputSchema}`,
        )
      }

      agents[name] = { name, url, client, card, skill, status: 'online' }
      logger?.info('agent discovered', { name, url, skill: skill.id })
    } catch (error) {
      agents[name] = { name, url, status: 'offline', reason: error.message }
      logger?.warn('agent unreachable or incompatible', {
        name,
        url,
        reason: error.message,
      })
    }
  }

  return agents
}

/** tag → [{ agent, skill }] across every online agent. */
export function buildSkillIndex(agents) {
  const index = new Map()
  for (const agent of Object.values(agents)) {
    if (agent.status !== 'online') continue
    for (const skill of agent.card.skills ?? []) {
      for (const tag of skill.tags ?? []) {
        if (!index.has(tag)) index.set(tag, [])
        index.get(tag).push({ agent: agent.name, skill: skill.id })
      }
    }
  }
  return index
}

export function onlineAgents(agents) {
  return Object.values(agents).filter((agent) => agent.status === 'online')
}
