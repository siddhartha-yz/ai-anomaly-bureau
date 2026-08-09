import { describe, expect, it } from 'vitest'
import { createDataset } from '../src/ml/data'
import { createDecisionGrid, evaluate } from '../src/ml/evaluate'
import { projectSamples } from '../src/ml/features'
import { MODEL_REGISTRY } from '../src/ml/registry'

describe('deterministic machine learning core', () => {
  it('reproduces a dataset with the same seed', () => {
    const a = createDataset(42)
    const b = createDataset(42)
    const c = createDataset(43)
    expect(a).toEqual(b)
    expect(a.train[0].features).not.toEqual(c.train[0].features)
  })

  it('keeps train and test splits separate', () => {
    const dataset = createDataset(20260809)
    expect(dataset.train).toHaveLength(36)
    expect(dataset.test).toHaveLength(24)
    expect(dataset.train.every((sample) => sample.split === 'train')).toBe(true)
    expect(dataset.test.every((sample) => sample.split === 'test')).toBe(true)
    expect(new Set(dataset.train.map((sample) => sample.id)).size).toBe(dataset.train.length)
  })

  it('creates a genuine shortcut failure on the hidden variants', () => {
    const dataset = createDataset(20260809)
    const features = ['warmth', 'roundness'] as const
    const train = projectSamples(dataset.train, features)
    const test = projectSamples(dataset.test, features)
    const fitted = MODEL_REGISTRY.linear.fit(train)
    const trainMetrics = evaluate(fitted, train)
    const testMetrics = evaluate(fitted, test)

    expect(trainMetrics.accuracy).toBeGreaterThanOrEqual(0.85)
    expect(testMetrics.accuracy).toBeLessThan(trainMetrics.accuracy)
    expect(testMetrics.mistakes.some((mistake) => mistake.id.includes('test-cat'))).toBe(true)
    expect(testMetrics.mistakes.some((mistake) => mistake.id.includes('test-bread'))).toBe(true)
  })

  it('allows a robust feature pair to generalize with simple models', () => {
    const dataset = createDataset(20260809)
    const features = ['texture', 'aspect'] as const
    const train = projectSamples(dataset.train, features)
    const test = projectSamples(dataset.test, features)

    const linear = evaluate(MODEL_REGISTRY.linear.fit(train), test)
    const tree = evaluate(MODEL_REGISTRY.tree.fit(train), test)
    const knn5 = evaluate(MODEL_REGISTRY['knn-5'].fit(train), test)

    expect(linear.accuracy).toBeGreaterThanOrEqual(0.84)
    expect(Math.max(tree.accuracy, knn5.accuracy)).toBeGreaterThanOrEqual(0.84)
  })

  it('exposes a real overfitting trap with 1-NN', () => {
    const dataset = createDataset(20260809)
    const features = ['texture', 'aspect'] as const
    const train = projectSamples(dataset.train, features)
    const test = projectSamples(dataset.test, features)

    const k1 = MODEL_REGISTRY['knn-1'].fit(train)
    const k5 = MODEL_REGISTRY['knn-5'].fit(train)
    const k1Train = evaluate(k1, train)
    const k1Test = evaluate(k1, test)
    const k5Test = evaluate(k5, test)

    expect(k1Train.accuracy).toBe(1)
    expect(k1Test.accuracy).toBeLessThan(k1Train.accuracy)
    expect(k1Test.accuracy).toBeLessThan(k5Test.accuracy)
    expect(k1Test.mistakes.some((mistake) => mistake.id.endsWith('-10') || mistake.id.endsWith('-11'))).toBe(true)
  })

  it('keeps the decision tree shallow and decision grid deterministic', () => {
    const dataset = createDataset(20260809)
    const train = projectSamples(dataset.train, ['texture', 'aspect'])
    const tree = MODEL_REGISTRY.tree.fit(train)
    const params = tree.describe()
    const gridA = createDecisionGrid(tree, 12)
    const gridB = createDecisionGrid(tree, 12)

    expect(params.actualDepth).toBeLessThanOrEqual(2)
    expect(gridA).toHaveLength(144)
    expect(gridA).toEqual(gridB)
  })
})
