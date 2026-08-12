import { describe, expect, it } from 'vitest'
import { clearDutyProgress, createDutyCasePreview, readDutyResume } from '../src/bureau/duty'
import { createEndlessCase } from '../src/endless/generator'
import { ENDLESS_SESSION_VERSION, endlessSessionKey, writeEndlessSession, type EndlessSessionData, type StorageLike } from '../src/endless/session'
import { accuracyBand } from '../src/endless/uiTypes'
import { evaluate } from '../src/ml/evaluate'
import { projectSamples } from '../src/ml/features'
import { MODEL_REGISTRY } from '../src/ml/registry'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

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

  it('summarizes and clears Duty persistence without exposing session internals to App', () => {
    const storage = new MemoryStorage()
    const caseData = createEndlessCase(6002)
    const model = caseData.baseline.model
    const features = [...caseData.baseline.features] as EndlessSessionData['features']
    const trainPoints = projectSamples(caseData.train, features)
    const train = evaluate(MODEL_REGISTRY[model].fit(trainPoints), trainPoints).accuracy
    const audit = caseData.audit(model, features)
    const saved: EndlessSessionData = {
      version: ENDLESS_SESSION_VERSION,
      seed: 6002,
      features,
      activeSlot: 1,
      model,
      trained: true,
      auditComplete: true,
      emergencyCredits: 0,
      history: [{
        id: 1,
        model,
        features,
        train,
        test: audit.accuracy,
        errors: audit.errorCount,
        prediction: accuracyBand(audit.accuracy),
        predictionHit: true,
        recall: audit.recall,
        reliable: caseData.isReliable(audit),
      }],
      diagnosisAttempts: 0,
      lastDiagnosisConfigCount: 0,
      lastDiagnosisRunCount: 0,
      selectedEvidenceRunIds: [],
      inspectedArchiveIds: [],
      inspectedCaseLeadIds: [],
      inspectedFieldErrors: [],
      solved: false,
    }
    expect(writeEndlessSession(storage, saved)).toBe(true)
    expect(readDutyResume(storage as unknown as Storage, 6002)).toEqual({
      seed: 6002,
      historyCount: 1,
      remainingCredits: 4,
      solved: false,
    })

    clearDutyProgress(storage as unknown as Storage, 6002)
    expect(storage.getItem(endlessSessionKey(6002))).toBeNull()
    expect(readDutyResume(storage as unknown as Storage, 6002)).toBeUndefined()
  })
})
