import { describe, expect, it } from 'vitest'
import { STAGE_CONTENT } from '../src/content/level1'
import { FEATURE_META } from '../src/ml/features'
import { MODEL_META } from '../src/ml/registry'

describe('teaching copy constraints', () => {
  it('keeps stage teaching lines concise', () => {
    for (const content of Object.values(STAGE_CONTENT)) {
      expect(content.task.length).toBeLessThanOrEqual(80)
      expect(content.assistant.length).toBeLessThanOrEqual(80)
    }
  })

  it('keeps feature and model explanations short', () => {
    for (const feature of Object.values(FEATURE_META)) expect(feature.description.length).toBeLessThanOrEqual(80)
    for (const model of Object.values(MODEL_META)) expect(model.description.length).toBeLessThanOrEqual(80)
  })
})
