import { describe, expect, it } from 'vitest'
import { FORMAL_CASE_CATALOG, STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, STORY_CASE_005 } from '../src/bureau/catalog'
import { createBureauProgress, formalCaseProgress, recordFormalCaseResolution } from '../src/bureau/progress'
import { createStoryCheatSession } from '../src/game/cheats'
import { storySessionKey, writeStorySession } from '../src/game/session'
import { FORMAL_CASE_RUNTIME_REGISTRY, formalCaseRuntime, readFormalCaseResumes } from '../src/story/registry'
import { puzzleSessionKey, writePuzzleSession } from '../src/story/puzzleSession'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('formal case runtime registry', () => {
  it('requires one runtime definition for every authored formal case', () => {
    expect(Object.keys(FORMAL_CASE_RUNTIME_REGISTRY).sort()).toEqual(FORMAL_CASE_CATALOG.map((item) => item.id).sort())
    for (const definition of FORMAL_CASE_CATALOG) {
      expect(formalCaseRuntime(definition.id).definition).toBe(definition)
    }
  })

  it('owns CASE 001 resume summaries and checkpoint clearing', () => {
    const storage = new MemoryStorage()
    const runtime = formalCaseRuntime(STORY_CASE_001.id)
    expect(runtime.readResume(storage as unknown as Storage, 20260809)).toBeUndefined()

    const checkpoint = createStoryCheatSession('overfit')
    expect(writeStorySession(storage as unknown as Storage, checkpoint)).toBe(true)
    expect(runtime.readResume(storage as unknown as Storage, checkpoint.seed)).toMatchObject({
      solved: false,
      experimentCount: 2,
      remainingCredits: 3,
    })
    expect(readFormalCaseResumes(storage as unknown as Storage, checkpoint.seed)[STORY_CASE_001.id]).toMatchObject({
      solved: false,
      experimentCount: 2,
    })

    runtime.clearSession(storage as unknown as Storage, checkpoint.seed)
    expect(storage.getItem(storySessionKey(checkpoint.seed))).toBeNull()
  })

  it('owns independent CASE 002 / CASE 003 / CASE 004 / CASE 005 puzzle checkpoints through the same registry', () => {
    const storage = new MemoryStorage()
    expect(writePuzzleSession(storage as unknown as Storage, {
      version: 1,
      caseId: STORY_CASE_002.id,
      seed: 20260809,
      stage: 1,
      checks: 3,
      mistakes: 1,
      selectedOptionId: 't55',
      lastRun: { stage: 1, optionId: 't55', correct: true },
      solved: false,
    })).toBe(true)
    expect(formalCaseRuntime(STORY_CASE_002.id).readResume(storage as unknown as Storage, 20260809)).toMatchObject({
      solved: false,
      experimentCount: 3,
      remainingCredits: 1,
      activityLabel: 'CHECKS',
      resourceLabel: 'REVISIONS',
    })
    expect(formalCaseRuntime(STORY_CASE_003.id).readResume(storage as unknown as Storage, 20260809)).toBeUndefined()
    expect(formalCaseRuntime(STORY_CASE_004.id).readResume(storage as unknown as Storage, 20260809)).toBeUndefined()
    expect(formalCaseRuntime(STORY_CASE_005.id).readResume(storage as unknown as Storage, 20260809)).toBeUndefined()

    formalCaseRuntime(STORY_CASE_002.id).clearSession(storage as unknown as Storage, 20260809)
    expect(storage.getItem(puzzleSessionKey(STORY_CASE_002.id, 20260809))).toBeNull()
  })

  it('reconciles solved authored puzzle checkpoints into generic Bureau progress', () => {
    const storage = new MemoryStorage()
    expect(writePuzzleSession(storage as unknown as Storage, {
      version: 1,
      caseId: STORY_CASE_003.id,
      seed: 20260809,
      stage: 2,
      checks: 4,
      mistakes: 1,
      selectedOptionId: 'shift',
      lastRun: { stage: 2, optionId: 'shift', correct: true },
      solved: true,
    })).toBe(true)

    let progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
    progress = recordFormalCaseResolution(progress, STORY_CASE_002.id, 'A', 90)
    const reconciled = formalCaseRuntime(STORY_CASE_003.id).reconcileProgress(storage as unknown as Storage, 20260809, progress)
    expect(formalCaseProgress(reconciled, STORY_CASE_003.id)).toMatchObject({ resolved: true, bestGrade: 'S', bestScore: 96 })
  })

  it('reconciles a resolved CASE 001 checkpoint into generic Bureau progress', () => {
    const storage = new MemoryStorage()
    const runtime = formalCaseRuntime(STORY_CASE_001.id)
    const checkpoint = createStoryCheatSession('closed')
    expect(writeStorySession(storage as unknown as Storage, checkpoint)).toBe(true)

    const reconciled = runtime.reconcileProgress(storage as unknown as Storage, checkpoint.seed, createBureauProgress())
    expect(formalCaseProgress(reconciled, STORY_CASE_001.id)).toMatchObject({
      resolved: true,
      bestGrade: 'A',
      bestScore: 100,
    })
  })
})
