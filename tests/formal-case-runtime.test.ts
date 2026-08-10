import { describe, expect, it } from 'vitest'
import { FORMAL_CASE_CATALOG, STORY_CASE_001 } from '../src/bureau/catalog'
import { createBureauProgress, formalCaseProgress } from '../src/bureau/progress'
import { createStoryCheatSession } from '../src/game/cheats'
import { storySessionKey, writeStorySession } from '../src/game/session'
import { FORMAL_CASE_RUNTIME_REGISTRY, formalCaseRuntime } from '../src/story/registry'

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

    runtime.clearSession(storage as unknown as Storage, checkpoint.seed)
    expect(storage.getItem(storySessionKey(checkpoint.seed))).toBeNull()
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
