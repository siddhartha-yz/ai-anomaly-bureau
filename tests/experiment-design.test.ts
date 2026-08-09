import { describe, expect, it } from 'vitest'
import { diagnosisEvidenceStatus, experimentConfigKey, experimentDelta, type EndlessRunRecord } from '../src/endless/uiTypes'

function record(overrides: Partial<EndlessRunRecord> = {}): EndlessRunRecord {
  return {
    id: 1,
    model: 'linear',
    features: ['warmth', 'roundness'],
    train: .9,
    test: .7,
    errors: 3,
    prediction: 'mid',
    predictionHit: true,
    recall: { cat: .7, bread: .7 },
    reliable: false,
    ...overrides,
  }
}

describe('endless experiment comparison metadata', () => {
  it('distinguishes controlled comparisons from changing everything at once', () => {
    const baseline = record()
    expect(experimentDelta(undefined, baseline)).toBe('baseline')
    expect(experimentDelta(baseline, record({ id: 2 }))).toBe('repeat')
    expect(experimentDelta(baseline, record({ id: 2, features: ['texture', 'aspect'] }))).toBe('fields-only')
    expect(experimentDelta(baseline, record({ id: 2, model: 'tree' }))).toBe('model-only')
    expect(experimentDelta(baseline, record({ id: 2, model: 'tree', features: ['texture', 'aspect'] }))).toBe('mixed')
  })

  it('treats swapping X and Y as the same observation set and configuration identity', () => {
    const baseline = record({ features: ['warmth', 'roundness'] })
    expect(experimentDelta(baseline, record({ id: 2, features: ['roundness', 'warmth'] }))).toBe('repeat')
    expect(experimentConfigKey('linear', ['warmth', 'roundness']))
      .toBe(experimentConfigKey('linear', ['roundness', 'warmth']))
    expect(experimentConfigKey('tree', ['warmth', 'roundness']))
      .not.toBe(experimentConfigKey('linear', ['warmth', 'roundness']))
  })

  it('requires two cited runs from genuinely different configurations', () => {
    const history = [
      record({ id: 1 }),
      record({ id: 2 }),
      record({ id: 3, features: ['texture', 'aspect'] }),
    ]
    expect(diagnosisEvidenceStatus(history, [1]).ready).toBe(false)
    expect(diagnosisEvidenceStatus(history, [1, 2]).ready).toBe(false)
    expect(diagnosisEvidenceStatus(history, [1, 3])).toMatchObject({
      distinctConfigurations: 2,
      includesFreshEvidence: true,
      ready: true,
    })
  })

  it('requires a retry report to cite evidence collected after the previous diagnosis', () => {
    const history = [
      record({ id: 1 }),
      record({ id: 2, features: ['texture', 'aspect'] }),
      record({ id: 3, model: 'tree', features: ['texture', 'aspect'] }),
    ]
    expect(diagnosisEvidenceStatus(history, [1, 2], 2)).toMatchObject({
      includesFreshEvidence: false,
      ready: false,
    })
    expect(diagnosisEvidenceStatus(history, [2, 3], 2)).toMatchObject({
      distinctConfigurations: 2,
      includesFreshEvidence: true,
      ready: true,
    })
  })
})
