import { describe, expect, it } from 'vitest'
import { QA_BACKUP_KEY, beginQaSession, clearQaWorkingState, qaSnapshotSummary, readQaSnapshot, restoreQaSession, type QaStorage } from '../src/qa/testBench'

class MemoryStorage implements QaStorage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('QA Test Bench save sandbox', () => {
  it('backs up all game saves once, allows destructive testing, then restores the exact original state', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.story-session.v1.20260809', 'story-original')
    storage.setItem('aia.bureau-progress.v2', 'bureau-original')
    storage.setItem('unrelated.preference', 'leave-me-alone')

    const snapshot = beginQaSession(storage, '/ai-anomaly-bureau/?mode=hub&seed=20260809')
    expect(snapshot).toBeDefined()
    expect(qaSnapshotSummary(snapshot)).toMatchObject({ savedKeys: 2, returnPath: '/ai-anomaly-bureau/?mode=hub&seed=20260809' })

    storage.setItem('aia.story-session.v1.20260809', 'story-test-mutated')
    storage.removeItem('aia.bureau-progress.v2')
    storage.setItem('aia.endless-session.v4.6006', 'test-duty')

    const result = restoreQaSession(storage)
    expect(result).toEqual({ ok: true, returnPath: '/ai-anomaly-bureau/?mode=hub&seed=20260809', restoredKeys: 2 })
    expect(storage.getItem('aia.story-session.v1.20260809')).toBe('story-original')
    expect(storage.getItem('aia.bureau-progress.v2')).toBe('bureau-original')
    expect(storage.getItem('aia.endless-session.v4.6006')).toBeNull()
    expect(storage.getItem('unrelated.preference')).toBe('leave-me-alone')
    expect(storage.getItem(QA_BACKUP_KEY)).toBeNull()
  })

  it('never overwrites the original snapshot with already-mutated test state', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.bureau-progress.v2', 'original')
    const first = beginQaSession(storage, '/first')
    storage.setItem('aia.bureau-progress.v2', 'mutated')
    const second = beginQaSession(storage, '/second')
    expect(second).toEqual(first)
    expect(second?.returnPath).toBe('/first')
    expect(second?.entries['aia.bureau-progress.v2']).toBe('original')
  })

  it('can clear every test save while keeping the recovery snapshot intact', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.story-session.v1.1', 'original')
    beginQaSession(storage, '/start')
    storage.setItem('aia.endless-session.v4.6000', 'temporary')
    expect(clearQaWorkingState(storage)).toBe(true)
    expect(storage.getItem('aia.story-session.v1.1')).toBeNull()
    expect(storage.getItem('aia.endless-session.v4.6000')).toBeNull()
    expect(readQaSnapshot(storage)?.entries['aia.story-session.v1.1']).toBe('original')
  })

  it('refuses sandbox clearing without a valid backup and removes corrupt backup metadata', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.story-session.v1.1', 'keep')
    expect(clearQaWorkingState(storage)).toBe(false)
    expect(storage.getItem('aia.story-session.v1.1')).toBe('keep')

    storage.setItem(QA_BACKUP_KEY, '{bad-json')
    expect(readQaSnapshot(storage)).toBeUndefined()
    // A parse failure is treated as unavailable; normal saves are never touched.
    expect(storage.getItem('aia.story-session.v1.1')).toBe('keep')
  })
})
