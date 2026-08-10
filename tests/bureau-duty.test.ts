import { describe, expect, it } from 'vitest'
import { clearDutyProgress, createDutyCasePreview, readDutyResume } from '../src/bureau/duty'
import { ENDLESS_SESSION_VERSION, endlessSessionKey, writeEndlessSession, type EndlessSessionData, type StorageLike } from '../src/endless/session'

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
    const saved: EndlessSessionData = {
      version: ENDLESS_SESSION_VERSION,
      seed: 6002,
      features: ['warmth', 'roundness'],
      activeSlot: 1,
      model: 'linear',
      trained: true,
      auditComplete: true,
      emergencyCredits: 0,
      history: [{
        id: 1,
        model: 'linear',
        features: ['warmth', 'roundness'],
        train: .8,
        test: .7,
        errors: 5,
        prediction: 'mid',
        predictionHit: true,
        recall: { cat: .8, bread: .6 },
        reliable: false,
      }],
      diagnosisAttempts: 0,
      lastDiagnosisConfigCount: 0,
      lastDiagnosisRunCount: 0,
      selectedEvidenceRunIds: [],
      inspectedArchiveIds: [],
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
