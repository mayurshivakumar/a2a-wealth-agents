// Demo 01 — discovery and version negotiation
//
// Teaches: agent cards at /.well-known/agent-card.json (v1.0
// supportedInterfaces shape), schema-tag compatibility checking, the
// /schemas/{name}.json endpoints, skills-by-tag indexing, graceful offline
// marking, and the A2A-Version header rules (-32009) + unknown methods (-32601).

import assert from 'node:assert/strict'
import { createRemoteClientFactory } from '@wealth/a2a-common'
import {
  AGENT_EXPECTATIONS,
  buildSkillIndex,
  discoverAgents,
} from '../apps/orchestrator/src/discovery.js'
import { runDemo, spawnAgents, step } from './lib/harness.js'

async function postA2A(url, { headers = {}, method = 'SendMessage' } = {}) {
  const response = await fetch(`${url}/a2a`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'probe-1',
      method,
      params: {
        message: {
          role: 'ROLE_USER',
          messageId: 'probe',
          parts: [{ text: 'probe', mediaType: 'text/plain' }],
        },
      },
    }),
  })
  return response.json()
}

await runDemo('01-discovery', async () => {
  const mesh = await spawnAgents(['portfolio', 'strategy', 'tax'], {
    portBase: 14010,
  })
  try {
    // Raw card fetch: the v1.0 shape (supportedInterfaces, no legacy fields).
    for (const name of ['portfolio', 'strategy', 'tax']) {
      const card = await (
        await fetch(`${mesh.urls[name]}/.well-known/agent-card.json`)
      ).json()
      assert.equal(card.supportedInterfaces.length, 1)
      assert.deepEqual(
        {
          protocolBinding: card.supportedInterfaces[0].protocolBinding,
          protocolVersion: card.supportedInterfaces[0].protocolVersion,
        },
        { protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      )
      assert.ok(card.supportedInterfaces[0].url.endsWith('/a2a'))
      assert.ok(!('url' in card), 'v1.0 cards have no top-level url')
      assert.deepEqual(card.capabilities.extensions, [])

      const health = await (await fetch(`${mesh.urls[name]}/healthz`)).json()
      assert.ok(health.name && health.version)
    }
    step(
      'three v1.0 cards fetched: supportedInterfaces + /healthz {name, version}',
    )

    // Each card's schema tags resolve to a served JSON schema.
    for (const [name, expectation] of Object.entries(AGENT_EXPECTATIONS)) {
      const schema = await (
        await fetch(
          `${mesh.urls[name]}/schemas/${expectation.inputSchema}.json`,
        )
      ).json()
      assert.equal(schema.type, 'object')
      const missing = await fetch(`${mesh.urls[name]}/schemas/nope-v9.json`)
      assert.equal(missing.status, 404)
    }
    step(
      'schema tags resolve: GET /schemas/{name}.json serves the Zod-generated contract',
    )

    // Orchestrator-style discovery: version validation + schema-tag check +
    // skills-by-tag index.
    const factory = createRemoteClientFactory({ timeoutMs: 5_000 })
    const agents = await discoverAgents({ urls: mesh.urls, factory })
    for (const name of ['portfolio', 'strategy', 'tax']) {
      assert.equal(agents[name].status, 'online')
      assert.ok(agents[name].skill, `${name} must advertise a compatible skill`)
    }
    const index = buildSkillIndex(agents)
    assert.deepEqual(index.get('tax'), [
      { agent: 'tax', skill: 'optimize-tax' },
    ])
    assert.ok(index.get('produces:portfolio-v1'))
    step('discovery validated versions + schema tags and indexed skills by tag')

    // Graceful degradation: an unreachable agent is marked offline, not fatal.
    const degraded = await discoverAgents({
      urls: { ...mesh.urls, tax: 'http://localhost:9' },
      factory: createRemoteClientFactory({ timeoutMs: 500 }),
    })
    assert.equal(degraded.tax.status, 'offline')
    assert.ok(degraded.tax.reason)
    assert.equal(degraded.portfolio.status, 'online')
    step(
      'unreachable agent → marked offline with a reason; the rest stay routable',
    )

    // Version negotiation: a missing header is treated as 0.3 → -32009; an
    // explicit 0.3 is equally rejected; unknown methods are -32601.
    const noHeader = await postA2A(mesh.urls.portfolio)
    assert.equal(noHeader.error.code, -32009)
    const oldVersion = await postA2A(mesh.urls.portfolio, {
      headers: { 'a2a-version': '0.3' },
    })
    assert.equal(oldVersion.error.code, -32009)
    const badMethod = await postA2A(mesh.urls.portfolio, {
      headers: { 'a2a-version': '1.0' },
      method: 'message/send',
    })
    assert.equal(badMethod.error.code, -32601)
    step(
      'negative cases: missing header → -32009, "0.3" → -32009, legacy method → -32601',
    )
  } finally {
    await mesh.teardown()
  }
})
