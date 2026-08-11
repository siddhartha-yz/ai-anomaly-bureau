import { describe, expect, it } from 'vitest'
import { evaluatePolicyGap, simulateEvidencePolicy } from '../src/endless/balance'
import { createEndlessCase } from '../src/endless/generator'

describe('endless gameplay balance baselines', () => {
  it('lets a simple evidence policy diagnose all four visible failure families without hidden answers', () => {
    for (const seed of [7200, 7201, 7202, 7203]) {
      const caseData = createEndlessCase(seed)
      const result = simulateEvidencePolicy(caseData)
      expect(result.diagnosis).toBe(caseData.diagnosis.correct)
      expect(result.bestAccuracy).toBeGreaterThanOrEqual(.85)
      expect(result.discriminating).toBe(true)
      expect(result.audits).toBeGreaterThanOrEqual(2)
      expect(result.audits).toBeLessThanOrEqual(3)
    }
  })

  it('makes evidence-led play substantially outperform five random brute-force audits', () => {
    const seeds = Array.from({ length: 90 }, (_, index) => 7300 + index)
    const gap = evaluatePolicyGap(seeds, 24)
    expect(gap.evidenceSolveRate).toBeGreaterThanOrEqual(.95)
    expect(gap.randomSolveRate).toBeLessThan(.25)
    expect(gap.evidenceSolveRate - gap.randomSolveRate).toBeGreaterThan(.7)
    expect(gap.evidenceMeanBestAccuracy - gap.randomMeanBestAccuracy).toBeGreaterThan(.07)
  }, 15_000)
})
