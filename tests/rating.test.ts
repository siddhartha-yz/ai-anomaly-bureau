import { describe, expect, it } from 'vitest'
import { calculateCaseScore } from '../src/components/CaseRating'

const clean = {
  experimentCount: 3,
  emergencyAudits: 0,
  hintLevel: 0,
  predictionHits: 2,
  predictionMisses: 0,
  trustedOldScore: false,
  reasoningMisses: 0,
}

describe('investigation rating', () => {
  it('reserves S rank for a clean evidence-led process', () => {
    expect(calculateCaseScore(clean).grade).toBe('S')
  })

  it('lets a mistaken deployment recover and finish, but not keep perfect rank', () => {
    const result = calculateCaseScore({ ...clean, trustedOldScore: true })
    expect(result.score).toBeGreaterThanOrEqual(85)
    expect(result.grade).toBe('A')
  })

  it('penalizes brute-force experiments, repeated reasoning misses and emergency audits', () => {
    const result = calculateCaseScore({
      ...clean,
      experimentCount: 7,
      emergencyAudits: 2,
      predictionMisses: 2,
      reasoningMisses: 3,
      hintLevel: 2,
    })
    expect(result.score).toBeLessThan(72)
    expect(result.grade).toBe('C')
  })
})
