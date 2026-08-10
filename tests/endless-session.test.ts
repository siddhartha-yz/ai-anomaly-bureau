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
