import type { EndlessSyndrome } from '../endless/generator'

export const BUREAU_PROGRESS_VERSION = 1
export const BUREAU_PROGRESS_KEY = `aia.bureau-progress.v${BUREAU_PROGRESS_VERSION}`

export type InvestigationGrade = 'S' | 'A' | 'B' | 'C'

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
  story001: {
    resolved: boolean
    bestGrade?: InvestigationGrade
    bestScore?: number
    resolvedAt?: string
  }
  bootCase000: {
    completed: boolean
    completedAt?: string
  }
  duty: {
    resolutions: DutyResolution[]
  }
}

const GRADES: InvestigationGrade[] = ['S', 'A', 'B', 'C']
const SYNDROMES: EndlessSyndrome[] = ['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']
const MAX_DUTY_ARCHIVE = 64

export function createBureauProgress(): BureauProgress {
  return {
    version: BUREAU_PROGRESS_VERSION,
    inductionAcknowledged: false,
    story001: { resolved: false },
    bootCase000: { completed: false },
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

function isProgress(value: unknown): value is BureauProgress {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.version !== BUREAU_PROGRESS_VERSION) return false

  const story = item.story001 as Record<string, unknown> | undefined
  const boot = item.bootCase000 as Record<string, unknown> | undefined
  const duty = item.duty as Record<string, unknown> | undefined
  if (typeof item.inductionAcknowledged !== 'boolean') return false
  if (!story || typeof story.resolved !== 'boolean') return false
  if (story.bestGrade !== undefined && !isGrade(story.bestGrade)) return false
  if (story.bestScore !== undefined && (typeof story.bestScore !== 'number' || story.bestScore < 0 || story.bestScore > 100)) return false
  if (story.resolvedAt !== undefined && !isIsoDate(story.resolvedAt)) return false
  if (!boot || typeof boot.completed !== 'boolean') return false
  if (boot.completedAt !== undefined && !isIsoDate(boot.completedAt)) return false
  if (!duty || !Array.isArray(duty.resolutions) || duty.resolutions.length > MAX_DUTY_ARCHIVE) return false

  const seenSeeds = new Set<number>()
  for (const resolution of duty.resolutions) {
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

export function readBureauProgress(storage: Pick<Storage, 'getItem' | 'removeItem'>): BureauProgress {
  try {
    const raw = storage.getItem(BUREAU_PROGRESS_KEY)
    if (!raw) return createBureauProgress()
    const parsed: unknown = JSON.parse(raw)
    if (!isProgress(parsed)) {
      storage.removeItem(BUREAU_PROGRESS_KEY)
      return createBureauProgress()
    }
    return parsed
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

export function recordStory001Resolution(progress: BureauProgress, grade: InvestigationGrade, score: number, now = new Date()): BureauProgress {
  const gradeRank = (value?: InvestigationGrade) => value ? GRADES.indexOf(value) : Number.POSITIVE_INFINITY
  const currentRank = gradeRank(progress.story001.bestGrade)
  const incomingRank = gradeRank(grade)
  const isBetterReport = progress.story001.bestGrade === undefined
    || incomingRank < currentRank
    || (incomingRank === currentRank && score > (progress.story001.bestScore ?? -1))
  return {
    ...progress,
    story001: {
      resolved: true,
      bestGrade: isBetterReport ? grade : progress.story001.bestGrade,
      bestScore: isBetterReport ? score : progress.story001.bestScore,
      resolvedAt: progress.story001.resolvedAt ?? now.toISOString(),
    },
  }
}

export function acknowledgeBureauInduction(progress: BureauProgress): BureauProgress {
  if (progress.inductionAcknowledged || !progress.story001.resolved) return progress
  return { ...progress, inductionAcknowledged: true }
}

export function recordBootCaseCompletion(progress: BureauProgress, now = new Date()): BureauProgress {
  if (progress.bootCase000.completed) return progress
  return {
    ...progress,
    bootCase000: { completed: true, completedAt: now.toISOString() },
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
  if (legacy.storyResolved && !next.story001.resolved) next = recordStory001Resolution(next, 'A', 85, now)
  if (legacy.bootCompleted && !next.bootCase000.completed) next = recordBootCaseCompletion(next, now)
  return next
}

export function bureauArchive(progress: BureauProgress) {
  const syndromes = new Set(progress.duty.resolutions.map((item) => item.syndrome))
  return [
    { id: 'train-test', title: '训练集 / 未知样本', discovered: progress.story001.resolved, source: 'CASE 001' },
    { id: 'generalization', title: '泛化', discovered: progress.story001.resolved, source: 'CASE 001' },
    { id: 'overfitting', title: '过拟合', discovered: progress.story001.resolved || syndromes.has('overfit-noise'), source: progress.story001.resolved ? 'CASE 001' : 'DUTY' },
    { id: 'controlled-experiment', title: '控制变量实验', discovered: progress.bootCase000.completed, source: 'TRAINING 000' },
    { id: 'recall', title: '分类别召回', discovered: progress.bootCase000.completed || syndromes.has('class-imbalance'), source: progress.bootCase000.completed ? 'TRAINING 000' : 'DUTY' },
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
  if (!progress.story001.resolved) return { code: 'TRAINEE', label: '实习调查员' }
  if (discoveredSyndromes >= 3) return { code: 'INDEPENDENT', label: '独立调查员' }
  return { code: 'FIELD', label: '正式调查员' }
}
