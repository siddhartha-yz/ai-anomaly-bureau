import { describe, expect, it } from 'vitest'
import { hypothesisAxisStatus, type EndlessRunRecord } from '../src/endless/uiTypes'

function run(id: number, overrides: Partial<EndlessRunRecord> = {}): EndlessRunRecord {
  return {
    id,
    model: 'linear',
    features: ['warmth', 'roundness'],
    train: .95,
    test: .60,
    errors: 8,
    prediction: 'mid',
    predictionHit: true,
    recall: { cat: .60, bread: .60 },
    reliable: false,
    ...overrides,
  }
}

describe('Duty accumulated hypothesis status', () => {
  it('does not let a later local null erase earlier material support on the same axis', () => {
    const history = [
      run(1),
      run(2, { features: ['texture', 'aspect'], test: .82, recall: { cat: .82, bread: .82 }, causalPrediction: 'improved' }),
      run(3, { model: 'tree', features: ['texture', 'aspect'], test: .82, recall: { cat: .82, bread: .82 }, causalPrediction: 'null' }),
      run(4, { model: 'tree', features: ['warmth', 'texture'], test: .84, recall: { cat: .84, bread: .84 }, causalPrediction: 'null' }),
    ]

    expect(hypothesisAxisStatus(history, 'fields')).toBe('contested')
    expect(hypothesisAxisStatus(history, 'model')).toBe('weakened')
  })

  it('keeps a single kind of controlled evidence as supported or weakened', () => {
    expect(hypothesisAxisStatus([run(1)], 'fields')).toBe('open')
    expect(hypothesisAxisStatus([
      run(1),
      run(2, { model: 'tree', test: .78, recall: { cat: .78, bread: .78 }, causalPrediction: 'improved' }),
    ], 'model')).toBe('supported')
    expect(hypothesisAxisStatus([
      run(1),
      run(2, { model: 'tree', test: .65, recall: { cat: .65, bread: .65 }, causalPrediction: 'null' }),
    ], 'model')).toBe('weakened')
  })
})
