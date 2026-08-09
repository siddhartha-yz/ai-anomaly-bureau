import { describe, expect, it } from 'vitest'
import { createEndlessCase, enumerateEndlessSolutions, type EndlessCase } from '../src/endless/generator'
import type { FeatureKey } from '../src/ml/types'

function keyWith(caseData: EndlessCase, text: string): FeatureKey {
  const entry = (Object.entries(caseData.featureNames) as Array<[FeatureKey, string]>).find(([, label]) => label.includes(text))
  if (!entry) throw new Error(`feature containing ${text} not found`)
  return entry[0]
}

function solutionFor(caseData: EndlessCase, model: string, featureA: FeatureKey, featureB: FeatureKey) {
  return enumerateEndlessSolutions(caseData).find((item) =>
    item.model === model && item.features[0] === featureA && item.features[1] === featureB,
  ) ?? enumerateEndlessSolutions(caseData).find((item) =>
    item.model === model && item.features[0] === featureB && item.features[1] === featureA,
  )!
}

describe('supervised endless case generator', () => {
  it('is deterministic, permutes sensor channels, and keeps test labels private', () => {
    const a = createEndlessCase(1203)
    const b = createEndlessCase(1203)
    const c = createEndlessCase(1207)
    expect(a.syndrome).toBe(b.syndrome)
    expect(a.train).toEqual(b.train)
    expect(a.featureNames).toEqual(b.featureNames)
    expect(a.publicTest).toEqual(b.publicTest)
    expect(a.publicTest.every((sample) => !('label' in sample))).toBe(true)
    expect(a.publicTest.every((sample) => /^field-\d{3}$/.test(sample.id))).toBe(true)
    expect(a.publicTest.every((sample) => !sample.id.includes('cat') && !sample.id.includes('bread'))).toBe(true)
    // Same syndrome does not imply fixed sensor positions across cases.
    expect(Object.entries(a.featureNames)).not.toEqual(Object.entries(c.featureNames))
  })

  it('generates solvable cases without making random configurations a reliable strategy', () => {
    let randomSuccessShare = 0
    const seeds = Array.from({ length: 30 }, (_, index) => 5000 + index)
    for (const seed of seeds) {
      const solutions = enumerateEndlessSolutions(createEndlessCase(seed))
      expect(solutions[0].testAccuracy).toBeGreaterThanOrEqual(0.83)
      randomSuccessShare += solutions.filter((item) => item.reliable).length / solutions.length
    }
    expect(randomSuccessShare / seeds.length).toBeLessThan(0.5)
  })

  it('contains distinct diagnostic phenomena rather than cosmetic case skins', () => {
    const featureGap = createEndlessCase(6000)
    const weakFeatures = solutionFor(featureGap, 'linear', keyWith(featureGap, '感叹号'), keyWith(featureGap, '链接'))
    const strongFeatures = solutionFor(featureGap, 'linear', keyWith(featureGap, '可信度'), keyWith(featureGap, '重复度'))
    expect(strongFeatures.testAccuracy - weakFeatures.testAccuracy).toBeGreaterThan(0.25)

    const overfit = createEndlessCase(6001)
    const stableA = keyWith(overfit, '纹理波动')
    const stableB = keyWith(overfit, '引脚比例')
    const memorizer = solutionFor(overfit, 'knn-1', stableA, stableB)
    const smoother = solutionFor(overfit, 'knn-5', stableA, stableB)
    expect(memorizer.trainAccuracy).toBeGreaterThanOrEqual(0.98)
    expect(smoother.testAccuracy).toBeGreaterThan(memorizer.testAccuracy)

    const shifted = createEndlessCase(6002)
    const shiftedShortcut = solutionFor(shifted, 'linear', keyWith(shifted, '画面亮度'), keyWith(shifted, '轮廓面积'))
    const stableFeatures = solutionFor(shifted, 'linear', keyWith(shifted, '局部纹理'), keyWith(shifted, '目标比例'))
    expect(shiftedShortcut.trainAccuracy).toBeGreaterThan(0.9)
    expect(stableFeatures.testAccuracy - shiftedShortcut.testAccuracy).toBeGreaterThan(0.25)

    const imbalanced = createEndlessCase(6003)
    const deceptive = enumerateEndlessSolutions(imbalanced).find((item) => item.testAccuracy >= .9 && !item.reliable)
    const reliable = enumerateEndlessSolutions(imbalanced).find((item) => item.reliable)
    expect(deceptive).toBeDefined()
    expect(deceptive!.minRecall).toBeLessThan(.75)
    expect(reliable?.testAccuracy).toBeGreaterThanOrEqual(.85)
    expect(reliable?.minRecall).toBeGreaterThanOrEqual(.75)
  })
})
