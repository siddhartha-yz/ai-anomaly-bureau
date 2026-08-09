import { describe, expect, it } from 'vitest'
import { experimentConfigKey, experimentDelta, type EndlessRunRecord } from '../src/endless/uiTypes'

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
})
