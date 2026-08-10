import { describe, expect, it } from 'vitest'
import { FORMAL_CASE_CATALOG, STORY_CASE_001, TRAINING_CASE_CATALOG, TRAINING_CASE_000, formalCaseCode, trainingCaseCode } from '../src/bureau/catalog'

describe('Bureau authored case catalog', () => {
  it('keeps V1 honest: exactly one authored formal case is registered', () => {
    expect(FORMAL_CASE_CATALOG).toHaveLength(1)
    expect(FORMAL_CASE_CATALOG[0]).toBe(STORY_CASE_001)
    expect(formalCaseCode(STORY_CASE_001)).toBe('CASE 001')
    expect(STORY_CASE_001.title).toBe('失控的分类器')
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

  it('keeps training content in a separate catalog instead of pretending it is Story Case 002', () => {
    expect(TRAINING_CASE_CATALOG).toEqual([TRAINING_CASE_000])
    expect(trainingCaseCode(TRAINING_CASE_000)).toBe('TRAINING 000')
    const formalNumbers = new Set<string>(FORMAL_CASE_CATALOG.map((item) => item.number))
    expect(formalNumbers.has(TRAINING_CASE_000.number)).toBe(false)
  })
})
