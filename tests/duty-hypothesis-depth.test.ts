import { describe, expect, it } from 'vitest'
import { createEndlessCase, enumerateEndlessSolutions, type EndlessSolution } from '../src/endless/generator'

function sameFeatures(a: EndlessSolution['features'], b: EndlessSolution['features']) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

function baselineSolution(seed: number) {
  const caseData = createEndlessCase(seed)
  const solutions = enumerateEndlessSolutions(caseData)
  const baseline = solutions.find((solution) =>
    solution.model === caseData.baseline.model && sameFeatures(solution.features, caseData.baseline.features),
  )
  if (!baseline) throw new Error(`Missing deployed baseline for seed ${seed}`)
  return { caseData, solutions, baseline }
}

function interventionGain(from: EndlessSolution, to: EndlessSolution) {
  return Math.max(to.testAccuracy - from.testAccuracy, to.minRecall - from.minRecall)
}

function bestFieldGain(baseline: EndlessSolution, solutions: EndlessSolution[]) {
  return Math.max(...solutions
    .filter((candidate) => candidate.model === baseline.model && !sameFeatures(candidate.features, baseline.features))
    .map((candidate) => interventionGain(baseline, candidate)))
}

function bestModelGain(baseline: EndlessSolution, solutions: EndlessSolution[]) {
  return Math.max(...solutions
    .filter((candidate) => candidate.model !== baseline.model && sameFeatures(candidate.features, baseline.features))
    .map((candidate) => interventionGain(baseline, candidate)))
}

describe('Duty hypothesis depth', () => {
  it('starts broad generated cases from a real failure with a material single-variable way to test competing explanations', () => {
    const seeds = Array.from({ length: 160 }, (_, index) => 7600 + index)
    let intendedAxisDominates = 0
    let overfitCases = 0
    let overfitK5Discriminates = 0

    for (const seed of seeds) {
      const { caseData, solutions, baseline } = baselineSolution(seed)
      const fieldGain = bestFieldGain(baseline, solutions)
      const modelGain = bestModelGain(baseline, solutions)
      const intendedGain = caseData.syndrome === 'overfit-noise' ? modelGain : fieldGain
      const alternateGain = caseData.syndrome === 'overfit-noise' ? fieldGain : modelGain

      // The world must first reproduce the incident. A Duty that is already
      // reliable before the player touches it has no mystery to investigate.
      expect(baseline.reliable, `seed ${seed} deployed baseline`).toBe(false)
      expect(intendedGain, `seed ${seed} has a material controlled intervention`).toBeGreaterThanOrEqual(.12)
      intendedAxisDominates += Number(intendedGain - alternateGain >= .08)

      if (caseData.syndrome === 'feature-gap') {
        expect(baseline.testAccuracy).toBeLessThan(.8)
      } else if (caseData.syndrome === 'overfit-noise') {
        overfitCases += 1
        expect(baseline.model).toBe('knn-1')
        expect(baseline.trainAccuracy).toBeGreaterThanOrEqual(.98)
        const k5 = solutions.find((candidate) => candidate.model === 'knn-5' && sameFeatures(candidate.features, baseline.features))!
        overfitK5Discriminates += Number(interventionGain(baseline, k5) >= .12)
      } else if (caseData.syndrome === 'distribution-shift') {
        expect(baseline.trainAccuracy).toBeGreaterThanOrEqual(.95)
        expect(baseline.testAccuracy).toBeLessThan(.8)
      } else {
        expect(baseline.testAccuracy).toBeGreaterThanOrEqual(.83)
        expect(baseline.minRecall).toBeLessThan(.75)
      }
    }

    // This is an experience metric, not a hidden-answer rule: in most generated
    // cases the syndrome-appropriate intervention axis should beat the competing
    // axis clearly enough that a controlled experiment can reduce uncertainty.
    expect(intendedAxisDominates / seeds.length).toBeGreaterThanOrEqual(.9)
    expect(overfitK5Discriminates / overfitCases).toBeGreaterThanOrEqual(.95)
  }, 15_000)
})
