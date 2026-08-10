import { describe, expect, it } from 'vitest'
import { TRAINING_CASE_CATALOG } from '../src/bureau/catalog'
import { TRAINING_CASE_RUNTIME_REGISTRY, trainingCaseRuntime } from '../src/training/registry'

describe('training case runtime registry', () => {
  it('requires one runtime definition for every authored training case', () => {
    expect(Object.keys(TRAINING_CASE_RUNTIME_REGISTRY).sort()).toEqual(TRAINING_CASE_CATALOG.map((item) => item.id).sort())
    for (const definition of TRAINING_CASE_CATALOG) {
      const runtime = trainingCaseRuntime(definition.id)
      expect(runtime.definition).toBe(definition)
      expect(runtime.Component).toBeTypeOf('function')
    }
  })
})
