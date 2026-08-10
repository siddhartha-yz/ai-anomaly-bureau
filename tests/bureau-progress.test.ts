import { describe, expect, it } from 'vitest'
import {
  BUREAU_PROGRESS_KEY,
  acknowledgeBureauInduction,
  bureauArchive,
  createBureauProgress,
  investigatorStatus,
  nextDutySeeds,
  readBureauProgress,
  reconcileLegacyProgress,
  recordBootCaseCompletion,
  recordDutyResolution,
  recordStory001Resolution,
  writeBureauProgress,
} from '../src/bureau/progress'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('Bureau meta progression', () => {
  it('starts as a trainee and unlocks the bureau after Story Case 001', () => {
    const base = createBureauProgress()
    expect(investigatorStatus(base).code).toBe('TRAINEE')
    expect(bureauArchive(base).every((item) => !item.discovered)).toBe(true)

    const resolved = recordStory001Resolution(base, 'A', 91, new Date('2026-08-10T01:00:00Z'))
    expect(resolved.story001).toMatchObject({ resolved: true, bestGrade: 'A', bestScore: 91 })
    expect(resolved.inductionAcknowledged).toBe(false)
    expect(acknowledgeBureauInduction(resolved).inductionAcknowledged).toBe(true)
    expect(investigatorStatus(resolved).code).toBe('FIELD')
    expect(bureauArchive(resolved).filter((item) => item.discovered).map((item) => item.id)).toEqual([
      'train-test', 'generalization', 'overfitting',
    ])
  })

  it('preserves first closure time while keeping the strongest Story score and grade', () => {
    const first = recordStory001Resolution(createBureauProgress(), 'B', 78, new Date('2026-08-10T01:00:00Z'))
    const better = recordStory001Resolution(first, 'A', 90, new Date('2026-08-11T01:00:00Z'))
    const lowerReplay = recordStory001Resolution(better, 'C', 60, new Date('2026-08-12T01:00:00Z'))

    expect(lowerReplay.story001.bestGrade).toBe('A')
    expect(lowerReplay.story001.bestScore).toBe(90)
    expect(lowerReplay.story001.resolvedAt).toBe('2026-08-10T01:00:00.000Z')
  })

  it('records Boot Case knowledge and distinct duty resolutions without XP grinding', () => {
    let progress = recordBootCaseCompletion(createBureauProgress(), new Date('2026-08-10T01:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6001, syndrome: 'overfit-noise', grade: 'B', score: 78 }, new Date('2026-08-10T02:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6001, syndrome: 'overfit-noise', grade: 'A', score: 89 }, new Date('2026-08-10T03:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6002, syndrome: 'distribution-shift', grade: 'S', score: 97 }, new Date('2026-08-10T04:00:00Z'))

    expect(progress.duty.resolutions).toHaveLength(2)
    expect(progress.duty.resolutions.find((item) => item.seed === 6001)?.score).toBe(89)
    expect(bureauArchive(progress).find((item) => item.id === 'controlled-experiment')?.discovered).toBe(true)
    expect(bureauArchive(progress).find((item) => item.id === 'distribution-shift')?.discovered).toBe(true)
  })

  it('does not reissue already resolved seeds in the duty queue', () => {
    let progress = createBureauProgress()
    progress = recordDutyResolution(progress, { seed: 6101, syndrome: 'overfit-noise', grade: 'A', score: 90 })
    progress = recordDutyResolution(progress, { seed: 6103, syndrome: 'distribution-shift', grade: 'A', score: 91 })
    expect(nextDutySeeds(progress, 6101)).toEqual([6102, 6104, 6105])
  })

  it('promotes only from distinct pathology experience, not repeated seed grinding', () => {
    let progress = recordStory001Resolution(createBureauProgress(), 'A', 90)
    progress = recordDutyResolution(progress, { seed: 1, syndrome: 'overfit-noise', grade: 'A', score: 90 })
    progress = recordDutyResolution(progress, { seed: 2, syndrome: 'overfit-noise', grade: 'A', score: 92 })
    progress = recordDutyResolution(progress, { seed: 3, syndrome: 'feature-gap', grade: 'A', score: 91 })
    expect(investigatorStatus(progress).code).toBe('FIELD')
    progress = recordDutyResolution(progress, { seed: 4, syndrome: 'class-imbalance', grade: 'B', score: 80 })
    expect(investigatorStatus(progress).code).toBe('INDEPENDENT')
  })

  it('round-trips valid progress and rejects malformed or duplicate duty archives', () => {
    const storage = new MemoryStorage()
    const progress = recordDutyResolution(
      recordStory001Resolution(createBureauProgress(), 'A', 90),
      { seed: 6001, syndrome: 'overfit-noise', grade: 'A', score: 90 },
    )
    expect(writeBureauProgress(storage as unknown as Storage, progress)).toBe(true)
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(progress)

    const malformed = structuredClone(progress)
    malformed.duty.resolutions.push({ ...malformed.duty.resolutions[0] })
    storage.setItem(BUREAU_PROGRESS_KEY, JSON.stringify(malformed))
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(createBureauProgress())
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).toBeNull()
  })

  it('migrates only stable facts from pre-Hub local saves', () => {
    const migrated = reconcileLegacyProgress(createBureauProgress(), { storyResolved: true, bootCompleted: true }, new Date('2026-08-10T01:00:00Z'))
    expect(migrated.story001.resolved).toBe(true)
    expect(migrated.bootCase000.completed).toBe(true)
    expect(migrated.duty.resolutions).toEqual([])
  })
})
