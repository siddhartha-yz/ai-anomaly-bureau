import { describe, expect, it } from 'vitest'
import { STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, STORY_CASE_005, TRAINING_CASE_000 } from '../src/bureau/catalog'
import {
  BUREAU_PROGRESS_KEY,
  BUREAU_PROGRESS_VERSION,
  acknowledgeBureauInduction,
  bureauArchive,
  createBureauProgress,
  formalCaseProgress,
  investigatorStatus,
  isBureauUnlocked,
  isFormalCaseAvailable,
  isTrainingCaseCompleted,
  nextDutySeeds,
  readBureauProgress,
  reconcileLegacyProgress,
  recordDutyResolution,
  recordFormalCaseResolution,
  recordTrainingCaseCompletion,
  trainingCaseProgress,
  writeBureauProgress,
} from '../src/bureau/progress'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('Bureau meta progression', () => {
  it('starts with sparse authored records and unlocks the bureau after the induction case', () => {
    const base = createBureauProgress()
    expect(base.formalCases).toEqual({})
    expect(base.trainingCases).toEqual({})
    expect(formalCaseProgress(base, STORY_CASE_001.id)).toEqual({ resolved: false })
    expect(trainingCaseProgress(base, TRAINING_CASE_000.id)).toEqual({ completed: false })
    expect(investigatorStatus(base).code).toBe('TRAINEE')
    expect(bureauArchive(base).every((item) => !item.discovered)).toBe(true)

    const resolved = recordFormalCaseResolution(base, STORY_CASE_001.id, 'A', 91, new Date('2026-08-10T01:00:00Z'))
    expect(formalCaseProgress(resolved, STORY_CASE_001.id)).toMatchObject({ resolved: true, bestGrade: 'A', bestScore: 91 })
    expect(resolved.inductionAcknowledged).toBe(false)
    expect(isBureauUnlocked(resolved)).toBe(true)
    expect(acknowledgeBureauInduction(resolved).inductionAcknowledged).toBe(true)
    expect(investigatorStatus(resolved).code).toBe('FIELD')
    expect(bureauArchive(resolved).filter((item) => item.discovered).map((item) => item.id)).toEqual([
      'train-test', 'generalization', 'overfitting',
    ])
  })

  it('unlocks authored cases sequentially and lets them contribute first-class archive knowledge', () => {
    let progress = acknowledgeBureauInduction(recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90))
    expect(isFormalCaseAvailable(progress, STORY_CASE_002)).toBe(true)
    expect(isFormalCaseAvailable(progress, STORY_CASE_003)).toBe(false)
    expect(isFormalCaseAvailable(progress, STORY_CASE_004)).toBe(false)
    expect(isFormalCaseAvailable(progress, STORY_CASE_005)).toBe(false)

    progress = recordFormalCaseResolution(progress, STORY_CASE_002.id, 'S', 100)
    expect(isFormalCaseAvailable(progress, STORY_CASE_003)).toBe(true)
    expect(bureauArchive(progress).find((item) => item.id === 'recall')).toMatchObject({ discovered: true, source: 'CASE 002' })
    expect(bureauArchive(progress).find((item) => item.id === 'class-imbalance')).toMatchObject({ discovered: true, source: 'CASE 002' })

    progress = recordFormalCaseResolution(progress, STORY_CASE_003.id, 'A', 92)
    expect(isFormalCaseAvailable(progress, STORY_CASE_004)).toBe(true)
    expect(bureauArchive(progress).find((item) => item.id === 'distribution-shift')).toMatchObject({ discovered: true, source: 'CASE 003' })
    expect(bureauArchive(progress).find((item) => item.id === 'controlled-experiment')?.discovered).toBe(true)

    progress = recordFormalCaseResolution(progress, STORY_CASE_004.id, 'S', 100)
    expect(isFormalCaseAvailable(progress, STORY_CASE_005)).toBe(true)
    expect(bureauArchive(progress).find((item) => item.id === 'data-leakage')).toMatchObject({ discovered: true, source: 'CASE 004' })
    expect(bureauArchive(progress).find((item) => item.id === 'group-split')).toMatchObject({ discovered: true, source: 'CASE 004' })

    progress = recordFormalCaseResolution(progress, STORY_CASE_005.id, 'A', 92)
    expect(bureauArchive(progress).find((item) => item.id === 'calibration')).toMatchObject({ discovered: true, source: 'CASE 005' })
    expect(bureauArchive(progress).find((item) => item.id === 'reliability')).toMatchObject({ discovered: true, source: 'CASE 005' })
  })

  it('preserves first closure time while keeping one coherent strongest formal-case report', () => {
    const first = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'B', 78, new Date('2026-08-10T01:00:00Z'))
    const better = recordFormalCaseResolution(first, STORY_CASE_001.id, 'A', 90, new Date('2026-08-11T01:00:00Z'))
    const lowerReplay = recordFormalCaseResolution(better, STORY_CASE_001.id, 'C', 60, new Date('2026-08-12T01:00:00Z'))
    const flawless = recordFormalCaseResolution(lowerReplay, STORY_CASE_001.id, 'S', 95, new Date('2026-08-13T01:00:00Z'))
    const higherNumberButLowerGrade = recordFormalCaseResolution(flawless, STORY_CASE_001.id, 'A', 100, new Date('2026-08-14T01:00:00Z'))
    const report = formalCaseProgress(higherNumberButLowerGrade, STORY_CASE_001.id)

    expect(report.bestGrade).toBe('S')
    expect(report.bestScore).toBe(95)
    expect(report.resolvedAt).toBe('2026-08-10T01:00:00.000Z')
  })

  it('records training knowledge and distinct duty resolutions without XP grinding', () => {
    let progress = recordTrainingCaseCompletion(createBureauProgress(), TRAINING_CASE_000.id, new Date('2026-08-10T01:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6001, syndrome: 'overfit-noise', grade: 'B', score: 78 }, new Date('2026-08-10T02:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6001, syndrome: 'overfit-noise', grade: 'A', score: 89 }, new Date('2026-08-10T03:00:00Z'))
    progress = recordDutyResolution(progress, { seed: 6002, syndrome: 'distribution-shift', grade: 'S', score: 97 }, new Date('2026-08-10T04:00:00Z'))

    expect(progress.duty.resolutions).toHaveLength(2)
    expect(progress.duty.resolutions.find((item) => item.seed === 6001)?.score).toBe(89)
    expect(isTrainingCaseCompleted(progress, TRAINING_CASE_000.id)).toBe(true)
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
    let progress = recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90)
    progress = recordDutyResolution(progress, { seed: 1, syndrome: 'overfit-noise', grade: 'A', score: 90 })
    progress = recordDutyResolution(progress, { seed: 2, syndrome: 'overfit-noise', grade: 'A', score: 92 })
    progress = recordDutyResolution(progress, { seed: 3, syndrome: 'feature-gap', grade: 'A', score: 91 })
    expect(investigatorStatus(progress).code).toBe('FIELD')
    progress = recordDutyResolution(progress, { seed: 4, syndrome: 'class-imbalance', grade: 'B', score: 80 })
    expect(investigatorStatus(progress).code).toBe('INDEPENDENT')
  })

  it('round-trips valid v2 progress and rejects malformed, unknown, or duplicate records', () => {
    const storage = new MemoryStorage()
    const progress = recordDutyResolution(
      recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90),
      { seed: 6001, syndrome: 'overfit-noise', grade: 'A', score: 90 },
    )
    expect(writeBureauProgress(storage as unknown as Storage, progress)).toBe(true)
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(progress)

    const duplicateDuty = structuredClone(progress)
    duplicateDuty.duty.resolutions.push({ ...duplicateDuty.duty.resolutions[0] })
    storage.setItem(BUREAU_PROGRESS_KEY, JSON.stringify(duplicateDuty))
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(createBureauProgress())
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).toBeNull()

    const unknownCase = structuredClone(progress) as unknown as { formalCases: Record<string, unknown> }
    unknownCase.formalCases['story-999'] = { resolved: true, bestGrade: 'A', bestScore: 90, resolvedAt: '2026-08-10T00:00:00.000Z' }
    storage.setItem(BUREAU_PROGRESS_KEY, JSON.stringify(unknownCase))
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(createBureauProgress())

    const outOfOrder = createBureauProgress()
    outOfOrder.formalCases[STORY_CASE_003.id] = { resolved: true, bestGrade: 'S', bestScore: 100, resolvedAt: '2026-08-10T00:00:00.000Z' }
    outOfOrder.formalCases[STORY_CASE_004.id] = { resolved: true, bestGrade: 'S', bestScore: 100, resolvedAt: '2026-08-10T00:00:00.000Z' }
    expect(writeBureauProgress(storage as unknown as Storage, outOfOrder)).toBe(false)
    storage.setItem(BUREAU_PROGRESS_KEY, JSON.stringify(outOfOrder))
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(createBureauProgress())
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).toBeNull()
  })

  it('migrates the previous Bureau v1 schema into catalog-keyed v2 records', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.bureau-progress.v1', JSON.stringify({
      version: 1,
      inductionAcknowledged: true,
      story001: { resolved: true, bestGrade: 'A', bestScore: 91, resolvedAt: '2026-08-10T01:00:00.000Z' },
      bootCase000: { completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
      duty: { resolutions: [{ seed: 6001, syndrome: 'feature-gap', grade: 'B', score: 80, resolvedAt: '2026-08-10T03:00:00.000Z' }] },
    }))

    const migrated = readBureauProgress(storage as unknown as Storage)
    expect(migrated.version).toBe(BUREAU_PROGRESS_VERSION)
    expect(formalCaseProgress(migrated, STORY_CASE_001.id)).toMatchObject({ resolved: true, bestGrade: 'A', bestScore: 91 })
    expect(trainingCaseProgress(migrated, TRAINING_CASE_000.id).completed).toBe(true)
    expect(migrated.duty.resolutions).toHaveLength(1)
    expect(storage.getItem('aia.bureau-progress.v1')).toBeNull()
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).not.toBeNull()
  })

  it('recovers an intact v1 save when the newer v2 JSON is corrupted', () => {
    const storage = new MemoryStorage()
    storage.setItem(BUREAU_PROGRESS_KEY, '{broken-v2-json')
    storage.setItem('aia.bureau-progress.v1', JSON.stringify({
      version: 1,
      inductionAcknowledged: true,
      story001: { resolved: true, bestGrade: 'B', bestScore: 82, resolvedAt: '2026-08-10T01:00:00.000Z' },
      bootCase000: { completed: false },
      duty: { resolutions: [] },
    }))

    const recovered = readBureauProgress(storage as unknown as Storage)
    expect(formalCaseProgress(recovered, STORY_CASE_001.id)).toMatchObject({ resolved: true, bestGrade: 'B', bestScore: 82 })
    expect(storage.getItem(BUREAU_PROGRESS_KEY)).not.toBeNull()
    expect(storage.getItem('aia.bureau-progress.v1')).toBeNull()
  })

  it('removes malformed legacy JSON instead of retrying the same broken payload forever', () => {
    const storage = new MemoryStorage()
    storage.setItem('aia.bureau-progress.v1', '{broken-v1-json')
    expect(readBureauProgress(storage as unknown as Storage)).toEqual(createBureauProgress())
    expect(storage.getItem('aia.bureau-progress.v1')).toBeNull()
  })

  it('migrates only stable facts from pre-Hub local saves', () => {
    const migrated = reconcileLegacyProgress(createBureauProgress(), { storyResolved: true, bootCompleted: true }, new Date('2026-08-10T01:00:00Z'))
    expect(formalCaseProgress(migrated, STORY_CASE_001.id).resolved).toBe(true)
    expect(trainingCaseProgress(migrated, TRAINING_CASE_000.id).completed).toBe(true)
    expect(migrated.duty.resolutions).toEqual([])
  })
})
