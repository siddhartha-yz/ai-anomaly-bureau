import { describe, expect, it } from 'vitest'
import { createStoryCheatSession, parseCheatCode, type StoryCheatTarget } from '../src/game/cheats'
import { readStorySession, storyAuditCredits, writeStorySession, type StorageLike } from '../src/game/session'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('cheat code parser', () => {
  it('accepts memorable story, authored-case, bureau, training, and duty aliases', () => {
    expect(parseCheatCode('case001 overfit')).toEqual({ ok: true, instruction: { kind: 'story', target: 'overfit', seed: undefined } })
    expect(parseCheatCode('STORY:FINAL@777')).toEqual({ ok: true, instruction: { kind: 'story', target: 'final', seed: 777 } })
    expect(parseCheatCode('case002')).toEqual({ ok: true, instruction: { kind: 'authored-case', caseId: 'story-002' } })
    expect(parseCheatCode('CASE003')).toEqual({ ok: true, instruction: { kind: 'authored-case', caseId: 'story-003' } })
    expect(parseCheatCode('bureau unlock')).toEqual({ ok: true, instruction: { kind: 'bureau-unlock' } })
    expect(parseCheatCode('boot')).toEqual({ ok: true, instruction: { kind: 'training' } })
    expect(parseCheatCode('duty 6003')).toEqual({ ok: true, instruction: { kind: 'duty', seed: 6003 } })
  })

  it('rejects malformed seeds and unknown commands without guessing', () => {
    expect(parseCheatCode('duty nope')).toMatchObject({ ok: false })
    expect(parseCheatCode('story overfit -1')).toMatchObject({ ok: false })
    expect(parseCheatCode('teleport moon')).toMatchObject({ ok: false })
  })
})

describe('story cheat checkpoints', () => {
  const expectedStages: Record<StoryCheatTarget, string> = {
    errors: 'inspect_errors',
    overfit: 'overfit_reveal',
    repair: 'iterate',
    final: 'final_audit',
    closed: 'complete',
  }

  for (const target of Object.keys(expectedStages) as StoryCheatTarget[]) {
    it(`${target} materializes a valid normal Story checkpoint`, () => {
      const storage = new MemoryStorage()
      const session = createStoryCheatSession(target, 20260809)
      expect(session.state.stage).toBe(expectedStages[target])
      expect(writeStorySession(storage, session)).toBe(true)
      const restored = readStorySession(storage, 20260809)
      expect(restored?.state.stage).toBe(expectedStages[target])
    })
  }

  it('reconstructs evidence and experiment history instead of raw stage teleporting', () => {
    const overfit = createStoryCheatSession('overfit')
    expect(overfit.experimentLog).toHaveLength(2)
    expect(overfit.state.auditHistory).toHaveLength(2)
    expect(overfit.state.hasSeenOverfit).toBe(true)
    expect(overfit.experimentLog[1].model).toBe('knn-1')
    expect(overfit.experimentLog[1].trainAccuracy).toBeGreaterThanOrEqual(.98)
    expect(overfit.experimentLog[1].auditAccuracy).toBeLessThan(overfit.experimentLog[1].trainAccuracy - .08)
    expect(storyAuditCredits(overfit)).toBe(3)

    const final = createStoryCheatSession('final')
    expect(final.experimentLog).toHaveLength(3)
    expect(final.repairSensorReads).toEqual(['texture', 'aspect'])
    expect(final.state.selectedFeatures).toEqual(['texture', 'aspect'])
    expect(final.state.audit?.accuracy).toBeGreaterThanOrEqual(.85)
    expect(storyAuditCredits(final)).toBe(2)
  })
})
