import { describe, expect, it } from 'vitest'
import { createEndlessCase, createEndlessCasePreview } from '../src/endless/generator'

function baselineField(seed: number) {
  const caseData = createEndlessCase(seed)
  const baseline = caseData.audit(caseData.baseline.model, caseData.baseline.features)
  return { caseData, fieldAccuracy: baseline.accuracy }
}

describe('Duty syndrome-level ambiguity', () => {
  it('keeps cause-specific archive facts sealed out of every opening brief', () => {
    for (let seed = 8200; seed < 8440; seed += 1) {
      const caseData = createEndlessCase(seed)
      const preview = createEndlessCasePreview(seed)
      const opening = [preview.title, preview.incident, ...preview.reportedFacts].join(' / ')

      expect(caseData.leadSources.map((lead) => lead.id)).toEqual(['composition', 'batch', 'quality'])
      for (const lead of caseData.leadSources) expect(opening).not.toContain(lead.finding)
      if (caseData.batchContext) {
        expect(opening).not.toContain(caseData.batchContext.history)
        expect(opening).not.toContain(caseData.batchContext.field)
      }
      for (const alert of caseData.archiveAlerts) expect(opening).not.toContain(alert.label)

      const catCount = caseData.train.filter((sample) => sample.label === 'cat').length
      const breadCount = caseData.train.filter((sample) => sample.label === 'bread').length
      expect(opening).not.toContain(`${catCount} 条`)
      expect(opening).not.toContain(`${breadCount} 条`)
      expect(opening).not.toMatch(/过拟合|分布漂移|类别不平衡|特征不足|Camera-[AB]|晴天 \/ 白天|夜场 \/|雨天 \/|质量告警/)
    }
  }, 15_000)

  it('lets a positive batch-change fact belong to multiple underlying syndromes', () => {
    const signalSyndromes = new Set<string>()
    let batchSignals = 0
    let shiftSignals = 0

    for (let seed = 9000; seed < 9400; seed += 1) {
      const caseData = createEndlessCase(seed)
      const batchLead = caseData.leadSources.find((lead) => lead.id === 'batch')!
      if (batchLead.result !== 'signal') continue
      batchSignals += 1
      signalSyndromes.add(caseData.syndrome)
      if (caseData.syndrome === 'distribution-shift') shiftSignals += 1
    }

    expect(signalSyndromes).toEqual(new Set(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']))
    expect(batchSignals).toBeGreaterThan(0)
    // Reading H-CONTEXT as “signal” must not collapse the diagnosis to shift.
    expect(shiftSignals / batchSignals).toBeLessThan(.65)
  }, 15_000)

  it('lets a positive archive-coverage warning belong to multiple underlying syndromes', () => {
    const signalSyndromes = new Set<string>()
    let coverageSignals = 0
    let imbalanceSignals = 0

    for (let seed = 9800; seed < 10200; seed += 1) {
      const caseData = createEndlessCase(seed)
      const coverageLead = caseData.leadSources.find((lead) => lead.id === 'composition')!
      if (coverageLead.result !== 'signal') continue
      coverageSignals += 1
      signalSyndromes.add(caseData.syndrome)
      if (caseData.syndrome === 'class-imbalance') imbalanceSignals += 1
    }

    expect(signalSyndromes).toEqual(new Set(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']))
    expect(coverageSignals).toBeGreaterThan(0)
    // Reading H-COVERAGE as “signal” must not collapse the diagnosis to imbalance.
    expect(imbalanceSignals / coverageSignals).toBeLessThan(.65)
  }, 15_000)

  it('lets a positive quality alert belong to multiple underlying syndromes', () => {
    const signalSyndromes = new Set<string>()
    let qualitySignals = 0
    let overfitSignals = 0

    for (let seed = 9400; seed < 9800; seed += 1) {
      const caseData = createEndlessCase(seed)
      const qualityLead = caseData.leadSources.find((lead) => lead.id === 'quality')!
      if (qualityLead.result !== 'signal') continue
      qualitySignals += 1
      signalSyndromes.add(caseData.syndrome)
      if (caseData.syndrome === 'overfit-noise') overfitSignals += 1
    }

    expect(signalSyndromes).toEqual(new Set(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']))
    expect(qualitySignals).toBeGreaterThan(0)
    expect(overfitSignals / qualitySignals).toBeLessThan(.65)
  }, 15_000)

  it('makes overfit and distribution-shift first audits occupy the same failure band', () => {
    const overfit: number[] = []
    const shift: number[] = []
    for (let seed = 7600; seed < 8400; seed += 1) {
      const { caseData, fieldAccuracy } = baselineField(seed)
      if (caseData.syndrome === 'overfit-noise') overfit.push(fieldAccuracy)
      if (caseData.syndrome === 'distribution-shift') shift.push(fieldAccuracy)
    }

    const sharedBand = (value: number) => value >= .53 && value < .85
    expect(overfit.filter(sharedBand).length / overfit.length).toBeGreaterThanOrEqual(.99)
    expect(shift.filter(sharedBand).length / shift.length).toBeGreaterThanOrEqual(.99)

    // The experience meaning of this threshold: seeing “TRAIN ≈ 100%, FIELD
    // roughly 55–85% but still unreliable” once must not tell a player whether the cause is noisy old
    // memory or a changed field environment. They need a quality/batch check or
    // a controlled model/field intervention to separate those stories.
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(Math.abs(mean(overfit) - mean(shift))).toBeLessThan(.08)
  }, 15_000)
})
