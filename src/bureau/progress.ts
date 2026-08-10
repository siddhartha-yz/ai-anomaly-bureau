import type { EndlessSyndrome } from '../endless/generator'
import {
  FORMAL_CASE_CATALOG,
  STORY_CASE_001,
  TRAINING_CASE_CATALOG,
  TRAINING_CASE_000,
  formalCaseCode,
  trainingCaseCode,
  type FormalCaseId,
  type TrainingCaseId,
} from './catalog'

export const BUREAU_PROGRESS_VERSION = 2
export const BUREAU_PROGRESS_KEY = `aia.bureau-progress.v${BUREAU_PROGRESS_VERSION}`
const LEGACY_BUREAU_PROGRESS_KEY = 'aia.bureau-progress.v1'

export type InvestigationGrade = 'S' | 'A' | 'B' | 'C'

export type FormalCaseProgress = {
  resolved: boolean
  bestGrade?: InvestigationGrade
  bestScore?: number
  resolvedAt?: string
}

export type TrainingCaseProgress = {
  completed: boolean
  completedAt?: string
}

export type DutyResolution = {
  seed: number
  syndrome: EndlessSyndrome
  grade: InvestigationGrade
  score: number
  resolvedAt: string
}

export type BureauProgress = {
  version: typeof BUREAU_PROGRESS_VERSION
  inductionAcknowledged: boolean
  formalCases: Partial<Record<FormalCaseId, FormalCaseProgress>>
  trainingCases: Partial<Record<TrainingCaseId, TrainingCaseProgress>>
  duty: {
    resolutions: DutyResolution[]
  }
}

type BureauProgressV1 = {
  version: 1
  inductionAcknowledged: boolean
  story001: FormalCaseProgress
  bootCase000: TrainingCaseProgress
  duty: {
    resolutions: DutyResolution[]
  }
}

const GRADES: InvestigationGrade[] = ['S', 'A', 'B', 'C']
const SYNDROMES: EndlessSyndrome[] = ['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']
const MAX_DUTY_ARCHIVE = 64
const FORMAL_CASE_IDS = new Set<string>(FORMAL_CASE_CATALOG.map((item) => item.id))
const TRAINING_CASE_IDS = new Set<string>(TRAINING_CASE_CATALOG.map((item) => item.id))
const EMPTY_FORMAL_CASE: FormalCaseProgress = { resolved: false }
const EMPTY_TRAINING_CASE: TrainingCaseProgress = { completed: false }

export function createBureauProgress(): BureauProgress {
  return {
    version: BUREAU_PROGRESS_VERSION,
    inductionAcknowledged: false,
    formalCases: {},
    trainingCases: {},
    duty: { resolutions: [] },
  }
}

function isGrade(value: unknown): value is InvestigationGrade {
  return typeof value === 'string' && GRADES.includes(value as InvestigationGrade)
}

function isSyndrome(value: unknown): value is EndlessSyndrome {
  return typeof value === 'string' && SYNDROMES.includes(value as EndlessSyndrome)
}

function isIsoDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isFormalCaseProgress(value: unknown): value is FormalCaseProgress {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.resolved !== 'boolean') return false
  if (item.bestGrade !== undefined && !isGrade(item.bestGrade)) return false
  if (item.bestScore !== undefined && (typeof item.bestScore !== 'number' || item.bestScore < 0 || item.bestScore > 100)) return false
  if (item.resolvedAt !== undefined && !isIsoDate(item.resolvedAt)) return false
  if (!item.resolved && (item.bestGrade !== undefined || item.bestScore !== undefined || item.resolvedAt !== undefined)) return false
  return true
}

function isTrainingCaseProgress(value: unknown): value is TrainingCaseProgress {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.completed !== 'boolean') return false
  if (item.completedAt !== undefined && !isIsoDate(item.completedAt)) return false
  if (!item.completed && item.completedAt !== undefined) return false
  return true
}

function isDutyArchive(value: unknown): value is DutyResolution[] {
  if (!Array.isArray(value) || value.length > MAX_DUTY_ARCHIVE) return false
  const seenSeeds = new Set<number>()
  for (const resolution of value) {
    if (!resolution || typeof resolution !== 'object') return false
    const record = resolution as Record<string, unknown>
    if (!Number.isInteger(record.seed) || (record.seed as number) < 0 || seenSeeds.has(record.seed as number)) return false
    if (!isSyndrome(record.syndrome) || !isGrade(record.grade)) return false
    if (typeof record.score !== 'number' || record.score < 0 || record.score > 100) return false
    if (!isIsoDate(record.resolvedAt)) return false
    seenSeeds.add(record.seed as number)
  }
  return true
}

function isProgress(value: unknown): value is BureauProgress {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.version !== BUREAU_PROGRESS_VERSION) return false
  if (typeof item.inductionAcknowledged !== 'boolean') return false
  if (!item.formalCases || typeof item.formalCases !== 'object' || Array.isArray(item.formalCases)) return false
  if (!item.trainingCases || typeof item.trainingCases !== 'object' || Array.isArray(item.trainingCases)) return false

  for (const [id, caseProgress] of Object.entries(item.formalCases as Record<string, unknown>)) {
    if (!FORMAL_CASE_IDS.has(id) || !isFormalCaseProgress(caseProgress)) return false
  }
  for (const [id, caseProgress] of Object.entries(item.trainingCases as Record<string, unknown>)) {
    if (!TRAINING_CASE_IDS.has(id) || !isTrainingCaseProgress(caseProgress)) return false
  }

  const duty = item.duty as Record<string, unknown> | undefined
  if (!duty || !isDutyArchive(duty.resolutions)) return false
  return true
}

function isProgressV1(value: unknown): value is BureauProgressV1 {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.version !== 1 || typeof item.inductionAcknowledged !== 'boolean') return false
  if (!isFormalCaseProgress(item.story001) || !isTrainingCaseProgress(item.bootCase000)) return false
  const duty = item.duty as Record<string, unknown> | undefined
  return Boolean(duty && isDutyArchive(duty.resolutions))
}

function migrateProgressV1(progress: BureauProgressV1): BureauProgress {
  return {
    version: BUREAU_PROGRESS_VERSION,
    inductionAcknowledged: progress.inductionAcknowledged,
    formalCases: progress.story001.resolved ? { [STORY_CASE_001.id]: progress.story001 } : {},
    trainingCases: progress.bootCase000.completed ? { [TRAINING_CASE_000.id]: progress.bootCase000 } : {},
    duty: { resolutions: progress.duty.resolutions },
  }
}

export function readBureauProgress(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): BureauProgress {
  try {
    const raw = storage.getItem(BUREAU_PROGRESS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isProgress(parsed)) return parsed
      storage.removeItem(BUREAU_PROGRESS_KEY)
    }

    const legacyRaw = storage.getItem(LEGACY_BUREAU_PROGRESS_KEY)
    if (!legacyRaw) return createBureauProgress()
    const legacyParsed: unknown = JSON.parse(legacyRaw)
    if (!isProgressV1(legacyParsed)) {
      storage.removeItem(LEGACY_BUREAU_PROGRESS_KEY)
      return createBureauProgress()
    }

    const migrated = migrateProgressV1(legacyParsed)
    if (writeBureauProgress(storage, migrated)) storage.removeItem(LEGACY_BUREAU_PROGRESS_KEY)
    return migrated
  } catch {
    try { storage.removeItem(BUREAU_PROGRESS_KEY) } catch { /* localStorage may be unavailable */ }
    return createBureauProgress()
  }
}

export function writeBureauProgress(storage: Pick<Storage, 'setItem'>, progress: BureauProgress) {
  if (!isProgress(progress)) return false
  try {
    storage.setItem(BUREAU_PROGRESS_KEY, JSON.stringify(progress))
    return true
  } catch {
    return false
  }
}

export function formalCaseProgress(progress: BureauProgress, id: FormalCaseId): FormalCaseProgress {
  return progress.formalCases[id] ?? EMPTY_FORMAL_CASE
}

export function trainingCaseProgress(progress: BureauProgress, id: TrainingCaseId): TrainingCaseProgress {
  return progress.trainingCases[id] ?? EMPTY_TRAINING_CASE
}

export function isFormalCaseResolved(progress: BureauProgress, id: FormalCaseId) {
  return formalCaseProgress(progress, id).resolved
}

export function isTrainingCaseCompleted(progress: BureauProgress, id: TrainingCaseId) {
  return trainingCaseProgress(progress, id).completed
}

export function recordFormalCaseResolution(
  progress: BureauProgress,
  id: FormalCaseId,
  grade: InvestigationGrade,
  score: number,
  now = new Date(),
): BureauProgress {
  const current = formalCaseProgress(progress, id)
  const gradeRank = (value?: InvestigationGrade) => value ? GRADES.indexOf(value) : Number.POSITIVE_INFINITY
  const currentRank = gradeRank(current.bestGrade)
  const incomingRank = gradeRank(grade)
  const isBetterReport = current.bestGrade === undefined
    || incomingRank < currentRank
    || (incomingRank === currentRank && score > (current.bestScore ?? -1))
  return {
    ...progress,
    formalCases: {
      ...progress.formalCases,
      [id]: {
        resolved: true,
        bestGrade: isBetterReport ? grade : current.bestGrade,
        bestScore: isBetterReport ? score : current.bestScore,
        resolvedAt: current.resolvedAt ?? now.toISOString(),
      },
    },
  }
}

export function isBureauUnlocked(progress: BureauProgress) {
  return isFormalCaseResolved(progress, STORY_CASE_001.id)
}

export function acknowledgeBureauInduction(progress: BureauProgress): BureauProgress {
  if (progress.inductionAcknowledged || !isBureauUnlocked(progress)) return progress
  return { ...progress, inductionAcknowledged: true }
}

export function recordTrainingCaseCompletion(progress: BureauProgress, id: TrainingCaseId, now = new Date()): BureauProgress {
  const current = trainingCaseProgress(progress, id)
  if (current.completed) return progress
  return {
    ...progress,
    trainingCases: {
      ...progress.trainingCases,
      [id]: { completed: true, completedAt: now.toISOString() },
    },
  }
}

export function recordDutyResolution(
  progress: BureauProgress,
  resolution: Omit<DutyResolution, 'resolvedAt'> & { resolvedAt?: string },
  now = new Date(),
): BureauProgress {
  const existing = progress.duty.resolutions.find((item) => item.seed === resolution.seed)
  const nextRecord: DutyResolution = {
    ...resolution,
    resolvedAt: resolution.resolvedAt ?? existing?.resolvedAt ?? now.toISOString(),
  }
  const resolutions = existing
    ? progress.duty.resolutions.map((item) => item.seed === resolution.seed
      ? (resolution.score > item.score ? nextRecord : item)
      : item)
    : [...progress.duty.resolutions, nextRecord]
  return {
    ...progress,
    duty: { resolutions: resolutions.slice(-MAX_DUTY_ARCHIVE) },
  }
}

export function reconcileLegacyProgress(progress: BureauProgress, legacy: { storyResolved: boolean; bootCompleted: boolean }, now = new Date()) {
  let next = progress
  if (legacy.storyResolved && !isFormalCaseResolved(next, STORY_CASE_001.id)) {
    next = recordFormalCaseResolution(next, STORY_CASE_001.id, 'A', 85, now)
  }
  if (legacy.bootCompleted && !isTrainingCaseCompleted(next, TRAINING_CASE_000.id)) {
    next = recordTrainingCaseCompletion(next, TRAINING_CASE_000.id, now)
  }
  return next
}

export function bureauArchive(progress: BureauProgress) {
  const syndromes = new Set(progress.duty.resolutions.map((item) => item.syndrome))
  const storyResolved = isFormalCaseResolved(progress, STORY_CASE_001.id)
  const trainingCompleted = isTrainingCaseCompleted(progress, TRAINING_CASE_000.id)
  return [
    { id: 'train-test', title: '训练集 / 未知样本', discovered: storyResolved, source: formalCaseCode(STORY_CASE_001) },
    { id: 'generalization', title: '泛化', discovered: storyResolved, source: formalCaseCode(STORY_CASE_001) },
    { id: 'overfitting', title: '过拟合', discovered: storyResolved || syndromes.has('overfit-noise'), source: storyResolved ? formalCaseCode(STORY_CASE_001) : 'DUTY' },
    { id: 'controlled-experiment', title: '控制变量实验', discovered: trainingCompleted, source: trainingCaseCode(TRAINING_CASE_000) },
    { id: 'recall', title: '分类别召回', discovered: trainingCompleted || syndromes.has('class-imbalance'), source: trainingCompleted ? trainingCaseCode(TRAINING_CASE_000) : 'DUTY' },
    { id: 'feature-gap', title: '观察信息不足', discovered: syndromes.has('feature-gap'), source: 'DUTY' },
    { id: 'distribution-shift', title: '分布变化', discovered: syndromes.has('distribution-shift'), source: 'DUTY' },
    { id: 'class-imbalance', title: '类别不平衡', discovered: syndromes.has('class-imbalance'), source: 'DUTY' },
  ]
}

export function nextDutySeeds(progress: BureauProgress, startSeed: number, count = 3) {
  const resolved = new Set(progress.duty.resolutions.map((item) => item.seed))
  const seeds: number[] = []
  let candidate = Math.max(0, Math.trunc(startSeed))
  while (seeds.length < count) {
    if (!resolved.has(candidate)) seeds.push(candidate)
    candidate += 1
  }
  return seeds
}

export function investigatorStatus(progress: BureauProgress) {
  const discoveredSyndromes = new Set(progress.duty.resolutions.map((item) => item.syndrome)).size
  if (!isBureauUnlocked(progress)) return { code: 'TRAINEE', label: '实习调查员' }
  if (discoveredSyndromes >= 3) return { code: 'INDEPENDENT', label: '独立调查员' }
  return { code: 'FIELD', label: '正式调查员' }
}
