import type { FormalCaseId } from '../bureau/catalog'
import type { StorageLike } from '../game/session'
import type { AuthoredPuzzleConfig } from './authoredCasePuzzles'

export const PUZZLE_SESSION_VERSION = 1
const MAX_PUZZLE_SESSION_BYTES = 24_000

export type PuzzleRun = {
  stage: number
  optionId: string
  correct: boolean
}

export type PuzzleSession = {
  version: typeof PUZZLE_SESSION_VERSION
  caseId: FormalCaseId
  seed: number
  stage: number
  checks: number
  mistakes: number
  selectedOptionId?: string
  lastRun?: PuzzleRun
  solved: boolean
}

export function puzzleSessionKey(caseId: FormalCaseId, seed: number) {
  return `aia.formal-puzzle.v${PUZZLE_SESSION_VERSION}.${caseId}.${seed}`
}

function isPuzzleRun(value: unknown, config: AuthoredPuzzleConfig, currentStage: number): value is PuzzleRun {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (!Number.isInteger(item.stage) || item.stage !== currentStage) return false
  if (typeof item.optionId !== 'string') return false
  const stage = config.stages[currentStage]
  const option = stage.options.find((candidate) => candidate.id === item.optionId)
  if (!option || typeof item.correct !== 'boolean') return false
  return item.correct === stage.correctIds.includes(option.id)
}

function isPuzzleSession(value: unknown, config: AuthoredPuzzleConfig, seed: number): value is PuzzleSession {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const caseId = config.definition.id
  const stageCount = config.stages.length
  if (item.version !== PUZZLE_SESSION_VERSION || item.caseId !== caseId || item.seed !== seed) return false
  if (!Number.isInteger(item.stage) || (item.stage as number) < 0 || (item.stage as number) >= stageCount) return false
  if (!Number.isInteger(item.checks) || (item.checks as number) < 0 || (item.checks as number) > 200) return false
  if (!Number.isInteger(item.mistakes) || (item.mistakes as number) < 0 || (item.mistakes as number) > (item.checks as number)) return false
  if (typeof item.solved !== 'boolean') return false

  const stage = item.stage as number
  const checks = item.checks as number
  const mistakes = item.mistakes as number
  const selectedOptionId = item.selectedOptionId
  if (selectedOptionId !== undefined) {
    if (typeof selectedOptionId !== 'string') return false
    if (!config.stages[stage].options.some((option) => option.id === selectedOptionId)) return false
  }

  let lastRun: PuzzleRun | undefined
  if (item.lastRun !== undefined) {
    if (!isPuzzleRun(item.lastRun, config, stage)) return false
    lastRun = item.lastRun
    if (selectedOptionId !== lastRun.optionId) return false
  }

  // Reaching stage N requires one accepted check for every earlier stage.
  // A correct current lastRun adds one more accepted check; mistakes account for
  // every rejected check. This prevents localStorage from skipping puzzle gates.
  const requiredAcceptedChecks = stage + (lastRun?.correct ? 1 : 0)
  if (checks - mistakes < requiredAcceptedChecks) return false

  if (item.solved) {
    if (stage !== stageCount - 1 || !lastRun?.correct) return false
    if (checks - mistakes < stageCount) return false
  }

  return true
}

export function readPuzzleSession(storage: StorageLike, config: AuthoredPuzzleConfig, seed: number) {
  const caseId = config.definition.id as FormalCaseId
  let raw: string | null
  try {
    raw = storage.getItem(puzzleSessionKey(caseId, seed))
  } catch {
    return undefined
  }
  if (!raw) return undefined
  if (new TextEncoder().encode(raw).byteLength > MAX_PUZZLE_SESSION_BYTES) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPuzzleSession(parsed, config, seed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writePuzzleSession(storage: Pick<StorageLike, 'setItem'>, session: PuzzleSession) {
  const raw = JSON.stringify(session)
  if (new TextEncoder().encode(raw).byteLength > MAX_PUZZLE_SESSION_BYTES) return false
  try {
    storage.setItem(puzzleSessionKey(session.caseId, session.seed), raw)
    return true
  } catch {
    return false
  }
}

export function clearPuzzleSession(storage: Pick<StorageLike, 'removeItem'>, caseId: FormalCaseId, seed: number) {
  try {
    storage.removeItem(puzzleSessionKey(caseId, seed))
  } catch { /* best effort */ }
}

export function puzzleSessionHasProgress(session: PuzzleSession) {
  return session.checks > 0 || session.stage > 0 || session.solved
}
