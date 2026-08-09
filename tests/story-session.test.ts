import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../src/game/reducer'
import {
  STORY_SESSION_VERSION,
  clearStorySession,
  readStorySession,
  storyAuditCredits,
  storySessionHasProgress,
  storySessionKey,
  writeStorySession,
  type StorySessionData,
} from '../src/game/session'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function session(seed = 20260809): StorySessionData {
  const state = createInitialGameState(seed, false, 1234)
  return {
    version: STORY_SESSION_VERSION,
    seed,
    state: { ...state, stage: 'inspect_data' },
    entryPhase: 'game',
    sensorReads: [],
    repairSensorReads: [],
    modelConfirmed: false,
    experimentLog: [],
    emergencyAudits: 0,
    reasoningMisses: 0,
  }
}

describe('Story Case local checkpoint', () => {
  it('round-trips player progress and derives paid audit credits instead of storing a refundable counter', () => {
    const storage = new MemoryStorage()
    const value = session()
    value.experimentLog = [
      { id: 1, model: 'linear', features: ['warmth', 'roundness'], trainAccuracy: .89, auditAccuracy: 1, errors: 0 },
      { id: 2, model: 'knn-1', features: ['texture', 'aspect'], trainAccuracy: 1, auditAccuracy: 1, errors: 0, prediction: 'train-up-test-down', predictionMatched: true },
      { id: 3, model: 'linear', features: ['texture', 'aspect'], trainAccuracy: .89, auditAccuracy: 1, errors: 0, prediction: 'test-improves', predictionMatched: true },
    ]
    value.state.auditHistory = value.experimentLog.map(() => ({
      accuracy: 1,
      errorCount: 0,
      confusion: { 'cat->cat': 8, 'cat->bread': 0, 'bread->cat': 0, 'bread->bread': 8 },
      mistakes: [],
      orangeCatErrors: 0,
    }))
    value.emergencyAudits = 1

    expect(writeStorySession(storage, value)).toBe(true)
    const restored = readStorySession(storage, value.seed)
    expect(restored?.experimentLog).toHaveLength(3)
    expect(storyAuditCredits(restored!)).toBe(3)
    expect(storySessionHasProgress(restored!)).toBe(true)
  })

  it('strips debug model params and private mistake flags before localStorage serialization', () => {
    const storage = new MemoryStorage()
    const value = session()
    const audit = {
      accuracy: .67,
      errorCount: 1,
      confusion: { 'cat->cat': 7, 'cat->bread': 1, 'bread->cat': 0, 'bread->bread': 8 },
      mistakes: [{
        id: 'field-002', actual: 'cat' as const, predicted: 'bread' as const, correct: false as const,
        features: { warmth: .9, roundness: .5, texture: .7, aspect: .4 },
        flags: { orangeCat: true, auditProbe: true },
      }],
      orangeCatErrors: 1,
    }
    value.state = {
      ...value.state,
      stage: 'inspect_errors',
      training: { accuracy: .89, errorCount: 4, complexity: 1, params: { threshold: .5 } },
      audit,
      auditHistory: [audit],
    }
    value.experimentLog = [{
      id: 1,
      model: 'linear',
      features: ['warmth', 'roundness'],
      trainAccuracy: .89,
      auditAccuracy: .67,
      errors: 1,
    }]
    value.selectedMistake = 'field-002'

    writeStorySession(storage, value)
    const raw = storage.getItem(storySessionKey(value.seed))!
    expect(raw).not.toContain('"auditCredits"')
    expect(raw).not.toContain('threshold')
    expect(raw).not.toContain('"flags"')
    expect(raw).not.toContain('auditProbe')
    expect(raw).not.toMatch(/test-(cat|bread)/)

    const restored = readStorySession(storage, value.seed)
    expect(restored?.state.audit?.mistakes[0].id).toBe('field-002')
    expect(restored?.state.audit?.mistakes[0].flags).toBeUndefined()
  })

  it('removes malformed, wrong-seed, stale-version and impossible-reference payloads', () => {
    const mutations: Array<(value: StorySessionData) => void> = [
      (value) => { value.version = 999 as typeof STORY_SESSION_VERSION },
      (value) => { value.state.seed += 1 },
      (value) => { value.selectedMistake = 'field-999' },
      (value) => { value.suspiciousAttemptId = 4 },
      (value) => {
        value.experimentLog = [{ id: 1, model: 'linear', features: ['warmth', 'roundness'], trainAccuracy: .89, auditAccuracy: .67, errors: 8 }]
      },
      (value) => {
        value.behaviorLog = {
          version: 1,
          sessionId: 's-invalid-log',
          seed: value.seed + 1,
          startedAt: new Date(0).toISOString(),
          exportedAt: new Date(1).toISOString(),
          events: [],
        }
      },
    ]

    for (const mutate of mutations) {
      const storage = new MemoryStorage()
      const value = session()
      mutate(value)
      storage.setItem(storySessionKey(value.seed), JSON.stringify(value))
      expect(readStorySession(storage, value.seed)).toBeUndefined()
      expect(storage.getItem(storySessionKey(value.seed))).toBeNull()
    }
  })

  it('does not treat an untouched title screen as resumable progress and clears explicitly', () => {
    const storage = new MemoryStorage()
    const value = session()
    value.entryPhase = 'title'
    value.state = createInitialGameState(value.seed, false, 1234)
    expect(storySessionHasProgress(value)).toBe(false)

    writeStorySession(storage, value)
    expect(clearStorySession(storage, value.seed)).toBe(true)
    expect(readStorySession(storage, value.seed)).toBeUndefined()
  })

  it('rejects hidden telemetry IDs, excessive event logs and oversized raw checkpoints', () => {
    const makeEvent = (seed: number, sessionId: string, index: number) => ({
      sessionId,
      seed,
      timestamp: new Date(1_000 + index).toISOString(),
      elapsedMs: index,
      stage: 'inspect_errors' as const,
      action: 'VIEW_MISTAKE',
      features: ['warmth', 'roundness'] as ['warmth', 'roundness'],
      model: 'linear' as const,
      mistakeId: 'field-002',
      retryCount: 0,
      completed: false,
    })

    {
      const storage = new MemoryStorage()
      const value = session()
      const sessionId = 's-test-123456'
      value.behaviorLog = {
        version: 1,
        sessionId,
        seed: value.seed,
        startedAt: new Date(0).toISOString(),
        exportedAt: new Date(2_000).toISOString(),
        events: [{ ...makeEvent(value.seed, sessionId, 1), mistakeId: 'test-cat-01' }],
      }
      storage.setItem(storySessionKey(value.seed), JSON.stringify(value))
      expect(readStorySession(storage, value.seed)).toBeUndefined()
    }

    {
      const storage = new MemoryStorage()
      const value = session()
      const sessionId = 's-test-123456'
      value.behaviorLog = {
        version: 1,
        sessionId,
        seed: value.seed,
        startedAt: new Date(0).toISOString(),
        exportedAt: new Date(2_000).toISOString(),
        events: Array.from({ length: 501 }, (_, index) => makeEvent(value.seed, sessionId, index)),
      }
      storage.setItem(storySessionKey(value.seed), JSON.stringify(value))
      expect(readStorySession(storage, value.seed)).toBeUndefined()
    }

    {
      const storage = new MemoryStorage()
      const value = session()
      storage.setItem(storySessionKey(value.seed), `${JSON.stringify(value)}${' '.repeat(200_001)}`)
      expect(readStorySession(storage, value.seed)).toBeUndefined()
      expect(storage.getItem(storySessionKey(value.seed))).toBeNull()
    }
  })
})
