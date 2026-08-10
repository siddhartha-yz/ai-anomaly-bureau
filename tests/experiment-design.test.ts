import { describe, expect, it } from 'vitest'
import { compareExperimentRecords, diagnosisEvidenceStatus, discriminatingExperiment, experimentConfigKey, experimentDelta, experimentPlanDelta, latestDiscriminatingExperiment, type EndlessRunRecord } from '../src/endless/uiTypes'

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

  it('classifies the next experiment plan before another audit is spent', () => {
    const previous = record()
    expect(experimentPlanDelta(previous, 'linear', ['roundness', 'warmth'])).toBe('repeat')
    expect(experimentPlanDelta(previous, 'linear', ['texture', 'aspect'])).toBe('fields-only')
    expect(experimentPlanDelta(previous, 'tree', ['warmth', 'roundness'])).toBe('model-only')
    expect(experimentPlanDelta(previous, 'tree', ['texture', 'aspect'])).toBe('mixed')
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

  it('compares two cited records without inferring a diagnosis', () => {
    const first = record({
      id: 1,
      train: .56,
      test: .46,
      errors: 15,
      recall: { cat: .50, bread: .42 },
    })
    const second = record({
      id: 2,
      features: ['texture', 'aspect'],
      train: 1,
      test: 1,
      errors: 0,
      recall: { cat: 1, bread: 1 },
    })
    const comparison = compareExperimentRecords(first, second)
    expect(comparison).toMatchObject({ delta: 'fields-only', errorDelta: -15 })
    expect(comparison.trainDelta).toBeCloseTo(.44)
    expect(comparison.fieldDelta).toBeCloseTo(.54)
    expect(comparison.minRecallDelta).toBeCloseTo(.58)
  })

  it('only treats a material single-variable improvement as hypothesis-discriminating evidence', () => {
    const baseline = record({ id: 1, test: .55, recall: { cat: .6, bread: .5 } })
    const fieldsOnly = record({
      id: 2,
      features: ['texture', 'aspect'],
      test: .82,
      recall: { cat: .85, bread: .8 },
    })
    expect(discriminatingExperiment(baseline, fieldsOnly)).toMatchObject({
      delta: 'fields-only',
      axis: 'fields',
      direction: 'improved',
      discriminating: true,
    })

    expect(discriminatingExperiment(fieldsOnly, baseline)).toMatchObject({
      delta: 'fields-only',
      axis: 'fields',
      direction: 'degraded',
      discriminating: true,
    })

    const mixed = record({ id: 3, model: 'tree', features: ['warmth', 'aspect'], test: .95, recall: { cat: .95, bread: .95 } })
    expect(discriminatingExperiment(fieldsOnly, mixed)).toMatchObject({ delta: 'mixed', discriminating: false })

    const tinyModelChange = record({ id: 3, model: 'tree', features: ['texture', 'aspect'], test: .86, recall: { cat: .86, bread: .83 } })
    expect(discriminatingExperiment(fieldsOnly, tinyModelChange)).toMatchObject({ delta: 'model-only', axis: 'model', discriminating: false })

    expect(latestDiscriminatingExperiment([baseline, fieldsOnly, mixed])?.comparison.axis).toBe('fields')
    expect(latestDiscriminatingExperiment([baseline, fieldsOnly, mixed], 2)).toBeUndefined()
  })
})
