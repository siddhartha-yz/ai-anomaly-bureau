import { describe, expect, it } from 'vitest'
import { bootstrapBureauProgress } from '../src/app/bootstrap'
import { STORY_CASE_001, STORY_CASE_002, TRAINING_CASE_000 } from '../src/bureau/catalog'
import { BUREAU_PROGRESS_KEY, createBureauProgress, formalCaseProgress, recordFormalCaseResolution, trainingCaseProgress, writeBureauProgress } from '../src/bureau/progress'
import { createStoryCheatSession } from '../src/game/cheats'
import { writeStorySession, type StorageLike } from '../src/game/session'
import { writePuzzleSession } from '../src/story/puzzleSession'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  get length() { return this.values.size }
}

describe('application Bureau bootstrap', () => {
  it('folds legacy Story and Training facts into canonical Bureau v2 progress', () => {
    const storage = new MemoryStorage()
    const story = createStoryCheatSession('closed', 20260809)
    expect(writeStorySession(storage, story)).toBe(true)
    storage.setItem('aia.boot-case-000.v2', 'complete')

    const progress = bootstrapBureauProgress(storage as unknown as Storage, 20260809)
    expect(formalCaseProgress(progress, STORY_CASE_001.id)).toMatchObject({ resolved: true, bestGrade: 'A', bestScore: 100 })
    expect(trainingCaseProgress(progress, TRAINING_CASE_000.id).completed).toBe(true)
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).not.toBeNull()
    expect(storage.getItem('aia.boot-case-000.v2')).toBeNull()
  })

  it('reconciles solved later authored-case checkpoints during bootstrap, not only CASE 001', () => {
    const storage = new MemoryStorage()
    const inducted = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
    expect(writeBureauProgress(storage, inducted)).toBe(true)
    expect(writePuzzleSession(storage, {
      version: 1,
      caseId: STORY_CASE_002.id,
      seed: 20260809,
      stage: 2,
      checks: 3,
      mistakes: 0,
      selectedOptionId: 'accuracy-up',
      lastRun: { stage: 2, optionId: 'accuracy-up', correct: true },
      solved: true,
    })).toBe(true)

    const progress = bootstrapBureauProgress(storage as unknown as Storage, 20260809)
    expect(formalCaseProgress(progress, STORY_CASE_002.id)).toMatchObject({ resolved: true, bestGrade: 'S', bestScore: 100 })
  })

  it('does not crash application startup when browser storage is unavailable', () => {
    const storage = {
      getItem() { throw new DOMException('Storage unavailable', 'SecurityError') },
      setItem() { throw new DOMException('Storage unavailable', 'SecurityError') },
      removeItem() { throw new DOMException('Storage unavailable', 'SecurityError') },
      clear() { throw new DOMException('Storage unavailable', 'SecurityError') },
      key() { return null },
      length: 0,
    } as unknown as Storage

    const progress = bootstrapBureauProgress(storage, 20260809)
    expect(formalCaseProgress(progress, STORY_CASE_001.id).resolved).toBe(false)
    expect(trainingCaseProgress(progress, TRAINING_CASE_000.id).completed).toBe(false)
  })
})
