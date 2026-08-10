import { describe, expect, it } from 'vitest'
import { ENDLESS_SESSION_VERSION, endlessSessionKey, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits, writeEndlessSession, type EndlessSessionData, type StorageLike } from '../src/endless/session'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function session(seed = 6000): EndlessSessionData {
  return {
    version: ENDLESS_SESSION_VERSION,
    seed,
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
      train: .56,
      test: .46,
      errors: 15,
      prediction: 'low',
      predictionHit: true,
      recall: { cat: .79, bread: .14 },
      reliable: false,
    }],
    diagnosisAttempts: 0,
    lastDiagnosisConfigCount: 0,
    lastDiagnosisRunCount: 0,
    selectedEvidenceRunIds: [],
    inspectedArchiveIds: [],
    inspectedCaseLeadIds: [],
    inspectedFieldErrors: [{ runId: 1, sampleId: 'field-002', actual: 'bread', predicted: 'cat' }],
    solved: false,
  }
}

describe('endless local session persistence', () => {
  it('round-trips only the versioned player-visible investigation state', () => {
    const storage = new MemoryStorage()
    const value = session()
    expect(writeEndlessSession(storage, value)).toBe(true)
    expect(readEndlessSession(storage, 6000)).toEqual(value)
    const raw = storage.getItem(endlessSessionKey(6000)) ?? ''
    expect(raw).toContain('field-002')
    expect(raw).not.toMatch(/test-cat|test-bread|syndrome|diagnosis\.correct/)
  })

  it('persists a pre-audit causal expectation and rejects unknown expectation values', () => {
    const storage = new MemoryStorage()
    const value = { ...session(), causalPrediction: 'null' as const }
    expect(writeEndlessSession(storage, value)).toBe(true)
    expect(readEndlessSession(storage, 6000)?.causalPrediction).toBe('null')

    storage.setItem(endlessSessionKey(6000), JSON.stringify({ ...value, causalPrediction: 'after-the-fact' }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('isolates progress by seed', () => {
    const storage = new MemoryStorage()
    writeEndlessSession(storage, session(6000))
    expect(readEndlessSession(storage, 6001)).toBeUndefined()
    expect(readEndlessSession(storage, 6000)?.history).toHaveLength(1)
  })

  it('drops malformed or incompatible session payloads instead of crashing the game', () => {
    const storage = new MemoryStorage()
    storage.setItem(endlessSessionKey(6000), '{not-json')
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(endlessSessionKey(6000))).toBeNull()

    storage.setItem(endlessSessionKey(6000), JSON.stringify({ ...session(), version: 99 }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(endlessSessionKey(6000))).toBeNull()
  })

  it('discards legacy v1 Duty history after the generated field semantics changed', () => {
    const storage = new MemoryStorage()
    const legacyKey = 'aia.endless-session.v1.6000'
    storage.setItem(legacyKey, JSON.stringify({ ...session(), version: 1 }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(legacyKey)).toBeNull()
  })

  it('migrates v5 Duty history but reopens H-COVERAGE after its semantics changed in v6', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v5.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['composition'] as const }
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 5 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('migrates v4 Duty history but reopens causal-source folders whose semantics changed by v6', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v4.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['batch'] as const }
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 4 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
    expect(storage.getItem(endlessSessionKey(6001))).not.toBeNull()
  })

  it('keeps the v3 source intact when canonical v6 migration cannot be written', () => {
    const backing = new MemoryStorage()
    const previousKey = 'aia.endless-session.v3.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['batch'] as const }
    backing.setItem(previousKey, JSON.stringify({ ...previous, version: 3 }))
    const storage: StorageLike = {
      getItem: (key) => backing.getItem(key),
      removeItem: (key) => backing.removeItem(key),
      setItem: (key, value) => {
        if (key === endlessSessionKey(6001)) throw new DOMException('quota', 'QuotaExceededError')
        backing.setItem(key, value)
      },
    }
    expect(readEndlessSession(storage, 6001)).toBeUndefined()
    expect(backing.getItem(previousKey)).not.toBeNull()
    expect(backing.getItem(endlessSessionKey(6001))).toBeNull()
  })

  it('still migrates v2 non-shift history directly into v6 with unopened causal sources', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v2.6001'
    const { inspectedCaseLeadIds: _newField, ...previous } = session(6001)
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 2 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('still drops v2 distribution-shift history because v3 changed that field world', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v2.6002'
    const { inspectedCaseLeadIds: _newField, ...previous } = session(6002)
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 2 }))
    expect(readEndlessSession(storage, 6002)).toBeUndefined()
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('rejects a forged run with impossible metric ranges', () => {
    const storage = new MemoryStorage()
    const invalid = session()
    invalid.history[0].test = 5
    storage.setItem(endlessSessionKey(6000), JSON.stringify(invalid))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('rejects impossible cross-field session relationships', () => {
    const storage = new MemoryStorage()
    const impossibleCitation = session()
    impossibleCitation.selectedEvidenceRunIds = [99]
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleCitation))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleAudit = session()
    impossibleAudit.auditComplete = true
    impossibleAudit.model = 'tree'
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleAudit))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleInspection = session()
    impossibleInspection.inspectedFieldErrors[0].runId = 7
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleInspection))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleLeadBudget = session()
    impossibleLeadBudget.inspectedCaseLeadIds = ['composition', 'batch']
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleLeadBudget))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const duplicateLead = session()
    duplicateLead.inspectedCaseLeadIds = ['quality', 'quality']
    storage.setItem(endlessSessionKey(6000), JSON.stringify(duplicateLead))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('distinguishes blank storage from resumable progress and derives remaining budget', () => {
    const active = session()
    expect(hasEndlessSessionProgress(active)).toBe(true)
    expect(remainingEndlessAuditCredits(active)).toBe(4)

    const blank: EndlessSessionData = {
      ...active,
      trained: false,
      auditComplete: false,
      history: [],
      inspectedFieldErrors: [],
    }
    expect(hasEndlessSessionProgress(blank)).toBe(false)
    expect(remainingEndlessAuditCredits(blank)).toBe(5)
  })
})
