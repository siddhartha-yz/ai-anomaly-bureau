import { describe, expect, it } from 'vitest'
import { createDutyCasePreview } from '../src/bureau/duty'

describe('Bureau Duty adapter', () => {
  it('exposes only symptom-safe queue fields to the Hub', () => {
    const preview = createDutyCasePreview(6001)
    expect(Object.keys(preview).sort()).toEqual(['caseNo', 'incident', 'reportedFacts', 'seed', 'title'])
    expect(preview.incident).not.toMatch(/过拟合|漂移|特征不足|类别不平衡/)
    expect('syndrome' in preview).toBe(false)
    expect('diagnosis' in preview).toBe(false)
    expect('publicTest' in preview).toBe(false)
    expect('audit' in preview).toBe(false)
  })
})
