import { describe, expect, it } from 'vitest'
import { causalForecastStats, causalPredictionResult, compareExperimentRecords, competingAxisNullResult, diagnosisEvidenceStatus, diagnosisInterventionAxis, diagnosisSourceLeadId, diagnosisSourceStatus, diagnosisSourceSupported, discriminatingExperiment, experimentConfigKey, experimentDelta, experimentPlanDelta, latestDiscriminatingExperiment, latestFalsifiedDiscriminatingExperiment, latestReliableDiscriminatingExperiment, preRegisteredNullResult, type EndlessRunRecord } from '../src/endless/uiTypes'

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
  it('maps each diagnosis to the intervention axis that can causally support it', () => {
    expect(diagnosisInterventionAxis('overfit-noise')).toBe('model')
    expect(diagnosisInterventionAxis('feature-gap')).toBe('fields')
    expect(diagnosisInterventionAxis('distribution-shift')).toBe('fields')
    expect(diagnosisInterventionAxis('class-imbalance')).toBe('fields')
  })

  it('requires source-identifiable diagnoses to inspect their matching positive cause source', () => {
    const leads = [
      { id: 'composition', label: 'coverage', prompt: '', finding: '', result: 'signal' },
      { id: 'batch', label: 'batch', prompt: '', finding: '', result: 'signal' },
      { id: 'quality', label: 'quality', prompt: '', finding: '', result: 'signal' },
    ] as const

    expect(diagnosisSourceLeadId('overfit-noise')).toBe('quality')
    expect(diagnosisSourceLeadId('distribution-shift')).toBe('batch')
    expect(diagnosisSourceLeadId('class-imbalance')).toBe('composition')
    expect(diagnosisSourceLeadId('feature-gap')).toBeUndefined()

    expect(diagnosisSourceStatus('overfit-noise', ['batch'], [...leads])).toBe('missing')
    expect(diagnosisSourceStatus('overfit-noise', ['quality'], [...leads])).toBe('supported')
    expect(diagnosisSourceSupported('overfit-noise', ['batch'], [...leads])).toBe(false)
    expect(diagnosisSourceSupported('overfit-noise', ['quality'], [...leads])).toBe(true)
    expect(diagnosisSourceSupported('distribution-shift', ['batch'], [...leads])).toBe(true)
    expect(diagnosisSourceSupported('class-imbalance', ['composition'], [...leads])).toBe(true)
    expect(diagnosisSourceStatus('feature-gap', [], [...leads])).toBe('not-required')
    expect(diagnosisSourceSupported('feature-gap', [], [...leads])).toBe(true)
    const contradictedLeads = [{ ...leads[0] }, { ...leads[1] }, { ...leads[2], result: 'clear' as const }]
    expect(diagnosisSourceStatus('overfit-noise', ['quality'], contradictedLeads)).toBe('contradicted')
    expect(diagnosisSourceSupported('overfit-noise', ['quality'], contradictedLeads)).toBe(false)
  })

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

  it('requires cited runs to be a genuinely executed sequential comparison', () => {
    const history = [
      record({ id: 1 }),
      record({ id: 2 }),
      record({ id: 3, features: ['texture', 'aspect'], reliable: true }),
    ]
    expect(diagnosisEvidenceStatus(history, [1]).ready).toBe(false)
    expect(diagnosisEvidenceStatus(history, [1, 2]).ready).toBe(false)
    expect(diagnosisEvidenceStatus(history, [1, 3])).toMatchObject({
      distinctConfigurations: 2,
      includesFreshEvidence: true,
      sequentialExperiment: false,
      ready: false,
    })
    expect(diagnosisEvidenceStatus(history, [2, 3])).toMatchObject({
      distinctConfigurations: 2,
      includesFreshEvidence: true,
      sequentialExperiment: true,
      ready: true,
    })
  })

  it('requires a retry report to cite evidence collected after the previous diagnosis', () => {
    const history = [
      record({ id: 1 }),
      record({ id: 2, features: ['texture', 'aspect'] }),
      record({ id: 3, model: 'tree', features: ['texture', 'aspect'], reliable: true }),
    ]
    expect(diagnosisEvidenceStatus(history, [1, 2], 2)).toMatchObject({
      includesFreshEvidence: false,
      sequentialExperiment: true,
      ready: false,
    })
    expect(diagnosisEvidenceStatus(history, [2, 3], 2)).toMatchObject({
      distinctConfigurations: 2,
      includesFreshEvidence: true,
      sequentialExperiment: true,
      ready: true,
    })
  })

  it('does not let a disconnected material comparison explain an unrelated reliable solution', () => {
    const baseline = record({ id: 1, test: .55, recall: { cat: .55, bread: .55 } })
    const materialButStillBroken = record({
      id: 2,
      features: ['texture', 'aspect'],
      test: .72,
      recall: { cat: .72, bread: .72 },
      causalPrediction: 'improved',
    })
    const unrelatedReliable = record({
      id: 3,
      model: 'tree',
      features: ['warmth', 'texture'],
      test: .92,
      recall: { cat: .92, bread: .90 },
      reliable: true,
    })
    const history = [baseline, materialButStillBroken, unrelatedReliable]

    expect(latestDiscriminatingExperiment(history)).toMatchObject({ second: { id: 2 } })
    expect(latestReliableDiscriminatingExperiment(history)).toBeUndefined()
    expect(diagnosisEvidenceStatus(history, [1, 2])).toMatchObject({
      sequentialExperiment: true,
      reachesReliableEndpoint: false,
      ready: false,
    })

    const repaired = { ...materialButStillBroken, reliable: true, test: .9, recall: { cat: .9, bread: .9 } }
    expect(latestReliableDiscriminatingExperiment([baseline, repaired])).toMatchObject({ second: { id: 2 } })
    expect(diagnosisEvidenceStatus([baseline, repaired], [1, 2])).toMatchObject({
      reachesReliableEndpoint: true,
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

  it('only lets a preregistered null falsify the competing intervention axis', () => {
    const baseline = record({ id: 1, model: 'linear', features: ['warmth', 'roundness'], test: .70, recall: { cat: .70, bread: .70 } })
    const fieldsSupport = record({ id: 2, model: 'linear', features: ['texture', 'aspect'], test: .90, recall: { cat: .90, bread: .90 }, causalPrediction: 'material' })
    const fieldsNull = record({ id: 3, model: 'linear', features: ['warmth', 'roundness'], test: .89, recall: { cat: .89, bread: .89 }, causalPrediction: 'null' })
    const modelNull = record({ id: 4, model: 'tree', features: ['warmth', 'roundness'], test: .88, recall: { cat: .88, bread: .88 }, causalPrediction: 'null' })

    expect(preRegisteredNullResult(fieldsSupport, fieldsNull)).toBe(true)
    const fieldsEvidence = { first: baseline, second: fieldsSupport, comparison: discriminatingExperiment(baseline, fieldsSupport) }
    expect(competingAxisNullResult([baseline, fieldsSupport, fieldsNull], fieldsEvidence)).toBeUndefined()
    expect(competingAxisNullResult([baseline, fieldsSupport, fieldsNull, modelNull], fieldsEvidence)).toMatchObject({
      first: { id: 3 },
      second: { id: 4 },
      comparison: { axis: 'model', discriminating: false },
    })
    const modelEvidence = { first: fieldsNull, second: modelNull, comparison: discriminatingExperiment(fieldsNull, modelNull) }
    expect(competingAxisNullResult([baseline, fieldsSupport, fieldsNull, modelNull], modelEvidence)).toMatchObject({
      first: { id: 2 },
      second: { id: 3 },
      comparison: { axis: 'fields', discriminating: false },
    })
  })

  it('does not let a disconnected competing-axis null falsify a material intervention', () => {
    const baseline = record({ id: 1, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 } })
    const fieldsSupport = record({ id: 2, model: 'linear', features: ['texture', 'aspect'], test: .90, recall: { cat: .90, bread: .90 } })
    const sameFieldsOtherModel = record({ id: 3, model: 'tree', features: ['texture', 'aspect'], test: .72, recall: { cat: .72, bread: .72 }, causalPrediction: 'degraded' })
    const disconnectedModelNull = record({ id: 4, model: 'knn-1', features: ['texture', 'aspect'], test: .73, recall: { cat: .73, bread: .72 }, causalPrediction: 'null' })
    const support = { first: baseline, second: fieldsSupport, comparison: discriminatingExperiment(baseline, fieldsSupport) }

    expect(competingAxisNullResult([baseline, fieldsSupport, sameFieldsOtherModel, disconnectedModelNull], support)).toBeUndefined()

    const modelSupportStart = record({ id: 5, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 } })
    const modelSupportEnd = record({ id: 6, model: 'tree', features: ['warmth', 'roundness'], test: .90, recall: { cat: .90, bread: .90 } })
    const unrelatedFieldsStart = record({ id: 7, model: 'tree', features: ['texture', 'aspect'], test: .72, recall: { cat: .72, bread: .72 }, causalPrediction: 'degraded' })
    const disconnectedFieldsNull = record({ id: 8, model: 'tree', features: ['warmth', 'texture'], test: .73, recall: { cat: .73, bread: .72 }, causalPrediction: 'null' })
    const modelSupport = { first: modelSupportStart, second: modelSupportEnd, comparison: discriminatingExperiment(modelSupportStart, modelSupportEnd) }

    expect(competingAxisNullResult(
      [modelSupportStart, modelSupportEnd, unrelatedFieldsStart, disconnectedFieldsNull],
      modelSupport,
    )).toBeUndefined()
  })

  it('keeps an earlier complete causal package valid after a later unrelated material experiment', () => {
    const baseline = record({ id: 1, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 } })
    const fieldsSupport = record({ id: 2, model: 'linear', features: ['texture', 'aspect'], test: .90, recall: { cat: .90, bread: .90 }, causalPrediction: 'improved' })
    const modelNull = record({ id: 3, model: 'tree', features: ['texture', 'aspect'], test: .91, recall: { cat: .91, bread: .90 }, causalPrediction: 'null' })
    const laterModelMaterial = record({ id: 4, model: 'knn-1', features: ['texture', 'aspect'], test: .70, recall: { cat: .70, bread: .69 }, causalPrediction: 'degraded' })
    const history = [baseline, fieldsSupport, modelNull, laterModelMaterial]

    expect(latestDiscriminatingExperiment(history)?.second.id).toBe(4)
    expect(competingAxisNullResult(history, latestDiscriminatingExperiment(history))).toBeUndefined()
    expect(latestFalsifiedDiscriminatingExperiment(history)).toMatchObject({
      support: { first: { id: 1 }, second: { id: 2 }, comparison: { axis: 'fields', discriminating: true } },
      falsification: { first: { id: 2 }, second: { id: 3 }, comparison: { axis: 'model', discriminating: false } },
    })
    expect(latestFalsifiedDiscriminatingExperiment(history, 0, true)).toBeUndefined()
    expect(latestFalsifiedDiscriminatingExperiment([
      baseline,
      { ...fieldsSupport, reliable: true },
      modelNull,
      laterModelMaterial,
    ], 0, true)).toMatchObject({ support: { second: { id: 2, reliable: true } } })
    expect(latestFalsifiedDiscriminatingExperiment(history, 2)).toBeUndefined()
  })

  it('does not let a fresh retry support reuse a null falsification from before the failed diagnosis', () => {
    const baseline = record({ id: 1, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 } })
    const oldModelNull = record({ id: 2, model: 'tree', features: ['warmth', 'roundness'], test: .61, recall: { cat: .61, bread: .60 }, causalPrediction: 'null' })
    const resetModel = record({ id: 3, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 }, causalPrediction: 'null' })
    const freshFieldsSupport = record({ id: 4, model: 'linear', features: ['texture', 'aspect'], test: .90, recall: { cat: .90, bread: .90 }, causalPrediction: 'improved' })
    const support = { first: resetModel, second: freshFieldsSupport, comparison: discriminatingExperiment(resetModel, freshFieldsSupport) }
    const history = [baseline, oldModelNull, resetModel, freshFieldsSupport]

    expect(competingAxisNullResult(history, support)).toMatchObject({
      first: { id: 2 },
      second: { id: 3 },
      comparison: { axis: 'model', discriminating: false },
    })
    expect(competingAxisNullResult(history, support, 3)).toBeUndefined()
    expect(latestFalsifiedDiscriminatingExperiment(history, 3)).toBeUndefined()
  })

  it('summarizes directional causal forecast calibration without counting baseline or mixed runs', () => {
    const baseline = record({ id: 1, test: .70, recall: { cat: .70, bread: .70 } })
    const fieldsHit = record({ id: 2, features: ['texture', 'aspect'], test: .90, recall: { cat: .90, bread: .90 }, causalPrediction: 'improved' })
    const modelMiss = record({ id: 3, model: 'tree', features: ['texture', 'aspect'], test: .91, recall: { cat: .91, bread: .91 }, causalPrediction: 'improved' })
    const mixed = record({ id: 4, model: 'linear', features: ['warmth', 'roundness'], test: .60, recall: { cat: .60, bread: .60 }, causalPrediction: 'degraded' })

    expect(causalForecastStats([baseline, fieldsHit, modelMiss, mixed])).toEqual({ total: 2, hits: 1, misses: 1 })
  })

  it('only lets a weak controlled result count as falsification when its causal expectation was registered first', () => {
    const baseline = record({ id: 1, test: .72, recall: { cat: .74, bread: .70 } })
    const weakModelChange = record({
      id: 2,
      model: 'tree',
      test: .75,
      recall: { cat: .76, bread: .72 },
    })
    expect(preRegisteredNullResult(baseline, weakModelChange)).toBe(false)
    expect(causalPredictionResult(baseline, { ...weakModelChange, causalPrediction: 'null' })).toEqual({ expected: 'null', observed: 'null', hit: true })
    expect(causalPredictionResult(baseline, { ...weakModelChange, causalPrediction: 'improved' })).toEqual({ expected: 'improved', observed: 'null', hit: false })
    expect(preRegisteredNullResult(baseline, { ...weakModelChange, causalPrediction: 'null' })).toBe(true)
    expect(preRegisteredNullResult(baseline, { ...weakModelChange, causalPrediction: 'improved' })).toBe(true)

    const improvedChange = { ...weakModelChange, test: .91, recall: { cat: .92, bread: .90 }, causalPrediction: 'improved' as const }
    expect(causalPredictionResult(baseline, improvedChange)).toEqual({ expected: 'improved', observed: 'improved', hit: true })
    expect(causalPredictionResult(baseline, { ...improvedChange, causalPrediction: 'degraded' })).toEqual({ expected: 'degraded', observed: 'improved', hit: false })
    expect(preRegisteredNullResult(baseline, improvedChange)).toBe(false)

    const degradedChange = { ...weakModelChange, test: .55, recall: { cat: .58, bread: .54 }, causalPrediction: 'degraded' as const }
    expect(causalPredictionResult(baseline, degradedChange)).toEqual({ expected: 'degraded', observed: 'degraded', hit: true })

    const tradeoffChange = {
      ...weakModelChange,
      test: .88,
      recall: { cat: .55, bread: .52 },
      causalPrediction: 'improved' as const,
    }
    expect(discriminatingExperiment(baseline, tradeoffChange)).toMatchObject({
      axis: 'model',
      direction: 'tradeoff',
      discriminating: true,
    })
    expect(causalPredictionResult(baseline, tradeoffChange)).toEqual({
      expected: 'improved',
      observed: 'tradeoff',
      hit: false,
    })
    expect(preRegisteredNullResult(baseline, tradeoffChange)).toBe(false)

    // Old v6 sessions used `material`; they remain readable and preserve the old
    // coarse hit semantics, but the current UI no longer creates this value.
    expect(causalPredictionResult(baseline, { ...improvedChange, causalPrediction: 'material' })).toEqual({ expected: 'material', observed: 'improved', hit: true })

    const mixed = { ...weakModelChange, features: ['texture', 'aspect'] as EndlessRunRecord['features'], causalPrediction: 'null' as const }
    expect(causalPredictionResult(baseline, mixed)).toBeUndefined()
    expect(preRegisteredNullResult(baseline, mixed)).toBe(false)
  })
})
