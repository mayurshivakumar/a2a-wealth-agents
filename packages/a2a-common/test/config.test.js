import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('applies documented defaults with an empty environment', () => {
    const config = loadConfig({})
    expect(config.openaiApiKey).toBeUndefined()
    expect(config.model).toBe('gpt-5.4-mini')
    expect(config.ports).toEqual({
      orchestrator: 3000,
      portfolio: 4001,
      strategy: 4002,
      tax: 4003,
    })
    expect(config.urls).toEqual({
      portfolio: 'http://localhost:4001',
      strategy: 'http://localhost:4002',
      tax: 'http://localhost:4003',
    })
    expect(config.getTaskPollMs).toBe(2000)
    expect(config.inputRequiredReminderMs).toBe(60_000)
    expect(config.sseReconnect).toEqual({ attempts: 3, baseMs: 1000 })
    expect(config.taxSimulatedDelayMs).toBe(1500)
    expect(config.langfuse.enabled).toBe(false)
  })

  it('coerces numeric overrides and strips trailing URL slashes', () => {
    const config = loadConfig({
      PORTFOLIO_PORT: '5001',
      TAX_AGENT_URL: 'http://tax.internal:9000/',
      GETTASK_POLL_MS: '25',
      TAX_SIMULATED_DELAY_MS: '10',
    })
    expect(config.ports.portfolio).toBe(5001)
    expect(config.urls.portfolio).toBe('http://localhost:5001')
    expect(config.urls.tax).toBe('http://tax.internal:9000')
    expect(config.getTaskPollMs).toBe(25)
    expect(config.taxSimulatedDelayMs).toBe(10)
  })

  it('treats blank optional secrets as absent (dotenv KEY= convention)', () => {
    const config = loadConfig({ OPENAI_API_KEY: '  ', LANGFUSE_PUBLIC_KEY: '' })
    expect(config.openaiApiKey).toBeUndefined()
    expect(config.langfuse.publicKey).toBeUndefined()
  })

  it('enables langfuse from keys unless LANGFUSE_TRACING overrides', () => {
    const fromKeys = loadConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
    })
    expect(fromKeys.langfuse.enabled).toBe(true)

    const disabled = loadConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_TRACING: 'false',
    })
    expect(disabled.langfuse.enabled).toBe(false)
  })

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/)
    expect(() => loadConfig({ PORTFOLIO_PORT: '-1' })).toThrow(/PORTFOLIO_PORT/)
  })
})
