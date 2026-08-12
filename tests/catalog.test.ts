import { describe, expect, it } from 'vitest'
import { FORMAL_CASE_CATALOG, STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, TRAINING_CASE_CATALOG, TRAINING_CASE_000, formalCaseCode, trainingCaseCode } from '../src/bureau/catalog'

describe('Bureau authored case catalog', () => {
  it('registers a real authored-case progression instead of a single-case shell', () => {
    expect(FORMAL_CASE_CATALOG).toEqual([STORY_CASE_001, STORY_CASE_002, STORY_CASE_003])
    expect(formalCaseCode(STORY_CASE_001)).toBe('CASE 001')
    expect(formalCaseCode(STORY_CASE_002)).toBe('CASE 002')
    expect(formalCaseCode(STORY_CASE_003)).toBe('CASE 003')
    expect(STORY_CASE_002.unlockAfter).toBe(STORY_CASE_001.id)
    expect(STORY_CASE_003.unlockAfter).toBe(STORY_CASE_002.id)
  })

  it('gives every authored case a stable unique id and number', () => {
    expect(new Set(FORMAL_CASE_CATALOG.map((item) => item.id)).size).toBe(FORMAL_CASE_CATALOG.length)
    expect(new Set(FORMAL_CASE_CATALOG.map((item) => item.number)).size).toBe(FORMAL_CASE_CATALOG.length)
    for (const item of FORMAL_CASE_CATALOG) {
      expect(item.title.length).toBeGreaterThan(2)
      expect(item.incident.length).toBeGreaterThan(8)
      expect(item.objective.length).toBeGreaterThan(8)
      expect(item.tags.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps training content in a separate catalog from the authored CASE 002/003 progression', () => {
    expect(TRAINING_CASE_CATALOG).toEqual([TRAINING_CASE_000])
    expect(trainingCaseCode(TRAINING_CASE_000)).toBe('TRAINING 000')
    const formalNumbers = new Set<string>(FORMAL_CASE_CATALOG.map((item) => item.number))
    expect(formalNumbers.has(TRAINING_CASE_000.number)).toBe(false)
  })
})
