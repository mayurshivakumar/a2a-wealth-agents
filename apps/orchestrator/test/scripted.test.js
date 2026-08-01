import { describe, expect, it } from 'vitest'
import {
  isAffirmative,
  isNegative,
  matchPhilosophy,
  parsePlainDate,
} from '../src/scripted.js'

describe('matchPhilosophy (D4 keyword matcher)', () => {
  it.each([
    ['1', 'bogleheads-three-fund'],
    ['Bogleheads please', 'bogleheads-three-fund'],
    ['a three-fund approach', 'bogleheads-three-fund'],
    ['bogleheads-three-fund', 'bogleheads-three-fund'],
    ['2', 'esg-tilt'],
    ['something sustainable', 'esg-tilt'],
    ['3', 'dividend-growth'],
    ['income focused', 'dividend-growth'],
    ['4', 'all-weather'],
    ['all weather', 'all-weather'],
    ['ALL-WEATHER', 'all-weather'],
  ])('maps %j → %s', (input, expected) => {
    expect(matchPhilosophy(input)).toBe(expected)
  })

  it('returns undefined for unmatched text and bare custom', () => {
    expect(matchPhilosophy('maximum yolo growth')).toBeUndefined()
    expect(matchPhilosophy('custom')).toBeUndefined()
  })
})

describe('parsePlainDate', () => {
  it('accepts ISO and written en-US dates', () => {
    expect(parsePlainDate('2024-03-15')).toBe('2024-03-15')
    expect(parsePlainDate('March 15, 2024')).toBe('2024-03-15')
    expect(parsePlainDate('march 5 2024')).toBe('2024-03-05')
  })

  it('rejects everything else deterministically', () => {
    expect(parsePlainDate('sometime in 2024')).toBeUndefined()
    expect(parsePlainDate('15/03/2024')).toBeUndefined()
    expect(parsePlainDate('Marchember 15, 2024')).toBeUndefined()
  })
})

describe('confirmations', () => {
  it('classifies yes/no', () => {
    expect(isAffirmative('y')).toBe(true)
    expect(isAffirmative('Yes')).toBe(true)
    expect(isNegative('n')).toBe(true)
    expect(isAffirmative('maybe')).toBe(false)
    expect(isNegative('maybe')).toBe(false)
  })
})
