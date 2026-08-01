import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemaRegistry } from '../src/index.js'

const fixturesDir = new URL('./fixtures/', import.meta.url)

function loadFixture(fileName) {
  return JSON.parse(readFileSync(new URL(fileName, fixturesDir), 'utf8'))
}

describe('contract fixtures', () => {
  for (const [name, schema] of Object.entries(schemaRegistry)) {
    it(`${name} accepts its valid fixture and round-trips through JSON`, () => {
      const parsed = schema.parse(loadFixture(`${name}.valid.json`))
      const reparsed = schema.parse(JSON.parse(JSON.stringify(parsed)))
      expect(reparsed).toEqual(parsed)
    })

    it(`${name} rejects its invalid fixture with issues`, () => {
      const result = schema.safeParse(loadFixture(`${name}.invalid.json`))
      expect(result.success).toBe(false)
      expect(result.error.issues.length).toBeGreaterThan(0)
    })
  }

  it('every fixture file maps to a registered schema', () => {
    const names = new Set(Object.keys(schemaRegistry))
    for (const file of readdirSync(fixturesDir)) {
      const base = file.replace(/\.(valid|invalid)\.json$/, '')
      expect(names, `${file} has no registered schema`).toContain(base)
    }
  })

  it('every registered schema has both fixture files', () => {
    const files = new Set(readdirSync(fixturesDir))
    for (const name of Object.keys(schemaRegistry)) {
      expect(files).toContain(`${name}.valid.json`)
      expect(files).toContain(`${name}.invalid.json`)
    }
  })
})
