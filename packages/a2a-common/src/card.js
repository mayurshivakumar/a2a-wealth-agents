const protocolVersion = '1.0'

/**
 * Builds an A2A v1.0 agent card. The JSON-RPC endpoint is always
 * `${baseUrl}/a2a`; schema compatibility is advertised through skill tags
 * (`schema:<input-schema>`, `produces:<output-schema>`) with the matching
 * JSON schema served at `${baseUrl}/schemas/{name}.json`.
 */
export function createAgentCard({
  name,
  description,
  version = '1.0.0',
  baseUrl,
  streaming,
  skills,
  defaultInputModes = ['application/json'],
  defaultOutputModes = ['application/json'],
}) {
  return {
    name,
    description,
    version,
    supportedInterfaces: [
      {
        url: `${baseUrl}/a2a`,
        protocolBinding: 'JSONRPC',
        protocolVersion,
        tenant: '',
      },
    ],
    capabilities: {
      streaming,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes,
    defaultOutputModes,
    skills: skills.map((skill) => ({
      inputModes: defaultInputModes,
      outputModes: defaultOutputModes,
      examples: [],
      ...skill,
      securityRequirements: [],
    })),
    signatures: [],
  }
}

/** Finds the first skill on a card carrying a given tag (e.g. "tax"). */
export function findSkillByTag(card, tag) {
  return (card.skills ?? []).find((skill) => (skill.tags ?? []).includes(tag))
}

/** Extracts `schema:`/`produces:` declarations from a skill's tags. */
export function skillSchemas(skill) {
  const tags = skill?.tags ?? []
  return {
    input: tags
      .find((tag) => tag.startsWith('schema:'))
      ?.slice('schema:'.length),
    output: tags
      .find((tag) => tag.startsWith('produces:'))
      ?.slice('produces:'.length),
  }
}
