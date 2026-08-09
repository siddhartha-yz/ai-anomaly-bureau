import type { ExperimentRecord } from '../components/CaseAttempts'
import type { ExperimentPrediction } from '../components/ExperimentPlan'
import type { EntryPhase } from '../components/EntryExperience'
import type { ModelId } from '../ml/registry'
import type { FeatureKey, Label, RawFeatures } from '../ml/types'
import type { BehaviorEvent, BehaviorLog } from './logging'
import type { AuditResult, GameState, MistakeDetail, Stage, TrainingResult } from './types'

export const STORY_SESSION_VERSION = 1
const MAX_STORY_SESSION_BYTES = 200_000
const MAX_BEHAVIOR_EVENTS = 500

export type StorySessionData = {
  version: typeof STORY_SESSION_VERSION
  seed: number
  state: GameState
  entryPhase: EntryPhase
  selectedMistake?: string
  observationAnswer?: string
  suspectSampleId?: string
  sensorReads: FeatureKey[]
  repairSensorReads: FeatureKey[]
  modelConfirmed: boolean
  boundaryProbeAnswer?: string
  successPrediction?: string
  evidenceInference?: string
  suspiciousAttemptId?: number
  overfitReflection?: string
  finalReflection?: string
  experimentLog: ExperimentRecord[]
  pendingPrediction?: ExperimentPrediction
  emergencyAudits: number
  reasoningMisses: number
  behaviorLog?: BehaviorLog
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const STAGES = new Set<Stage>([
  'briefing', 'inspect_data', 'choose_features', 'choose_model', 'train', 'first_success',
  'hidden_test', 'inspect_errors', 'iterate', 'overfit_reveal', 'final_audit',
  'transfer_question', 'complete',
])
const ENTRY_PHASES = new Set<EntryPhase>(['title', 'incident', 'boot', 'game'])
const FEATURES = new Set<FeatureKey>(['warmth', 'roundness', 'texture', 'aspect'])
const MODELS = new Set<ModelId>(['linear', 'tree', 'knn-1', 'knn-5'])
const LABELS = new Set<Label>(['cat', 'bread'])
const PREDICTIONS = new Set<ExperimentPrediction>(['both-improve', 'train-up-test-down', 'test-improves', 'no-idea'])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isFeaturePair(value: unknown): value is [FeatureKey, FeatureKey] {
  return Array.isArray(value)
    && value.length === 2
    && FEATURES.has(value[0] as FeatureKey)
    && FEATURES.has(value[1] as FeatureKey)
    && value[0] !== value[1]
}

function isRawFeatures(value: unknown): value is RawFeatures {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RawFeatures>
  return [...FEATURES].every((feature) => isFiniteNumber(item[feature]) && item[feature]! >= 0 && item[feature]! <= 1)
}

function isTrainingResult(value: unknown): value is TrainingResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<TrainingResult>
  return isRate(item.accuracy)
    && isNonNegativeInteger(item.errorCount)
    && isFiniteNumber(item.complexity)
    && item.params === undefined
}

function isMistake(value: unknown): value is MistakeDetail {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MistakeDetail>
  return typeof item.id === 'string'
    && /^field-\d{3}$/.test(item.id)
    && LABELS.has(item.actual as Label)
    && LABELS.has(item.predicted as Label)
    && typeof item.correct === 'boolean'
    && item.correct === false
    && isRawFeatures(item.features)
    && item.flags === undefined
}

function isAuditResult(value: unknown): value is AuditResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<AuditResult>
  const confusion = item.confusion as Record<string, unknown> | undefined
  return isRate(item.accuracy)
    && isNonNegativeInteger(item.errorCount)
    && item.errorCount === item.mistakes?.length
    && Boolean(confusion)
    && ['cat->cat', 'cat->bread', 'bread->cat', 'bread->bread'].every((key) => isNonNegativeInteger(confusion?.[key]))
    && Array.isArray(item.mistakes)
    && item.mistakes.every(isMistake)
    && isNonNegativeInteger(item.orangeCatErrors)
    && item.orangeCatErrors <= item.errorCount
}

function isGameState(value: unknown, seed: number): value is GameState {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<GameState>
  const completionStateValid = item.stage === 'complete'
    ? isFiniteNumber(item.completedAt) && typeof item.transferAnswer === 'string' && item.transferCorrect === true
    : item.completedAt === undefined
  return item.seed === seed
    && item.debug === false
    && STAGES.has(item.stage as Stage)
    && isFeaturePair(item.selectedFeatures)
    && MODELS.has(item.selectedModel as ModelId)
    && (item.training === undefined || isTrainingResult(item.training))
    && (item.audit === undefined || isAuditResult(item.audit))
    && Array.isArray(item.auditHistory)
    && item.auditHistory.every(isAuditResult)
    && Array.isArray(item.viewedMistakes)
    && item.viewedMistakes.every((id) => typeof id === 'string' && /^field-\d{3}$/.test(id))
    && isNonNegativeInteger(item.attempts)
    && isNonNegativeInteger(item.retryCount)
    && isNonNegativeInteger(item.failureStreak)
    && isNonNegativeInteger(item.hintLevel)
    && item.hintLevel <= 3
    && typeof item.hasSeenOverfit === 'boolean'
    && (item.transferAnswer === undefined || typeof item.transferAnswer === 'string')
    && (item.transferCorrect === undefined || typeof item.transferCorrect === 'boolean')
    && isFiniteNumber(item.startedAt)
    && completionStateValid
    && Array.isArray(item.diagnostics)
    && item.diagnostics.every((message) => typeof message === 'string')
}

function isExperimentRecord(value: unknown): value is ExperimentRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ExperimentRecord>
  return isNonNegativeInteger(item.id)
    && item.id > 0
    && MODELS.has(item.model as ModelId)
    && isFeaturePair(item.features)
    && isRate(item.trainAccuracy)
    && isRate(item.auditAccuracy)
    && isNonNegativeInteger(item.errors)
    && (item.prediction === undefined || PREDICTIONS.has(item.prediction))
    && (item.predictionMatched === undefined || typeof item.predictionMatched === 'boolean')
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isBehaviorEvent(value: unknown, seed: number, sessionId: string): value is BehaviorEvent {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BehaviorEvent>
  return item.sessionId === sessionId
    && item.seed === seed
    && typeof item.timestamp === 'string'
    && Number.isFinite(Date.parse(item.timestamp))
    && isNonNegativeInteger(item.elapsedMs)
    && STAGES.has(item.stage as Stage)
    && typeof item.action === 'string'
    && item.action.length > 0
    && item.action.length <= 80
    && (item.features === undefined || isFeaturePair(item.features))
    && (item.model === undefined || MODELS.has(item.model as ModelId))
    && (item.trainAccuracy === undefined || isRate(item.trainAccuracy))
    && (item.testAccuracy === undefined || isRate(item.testAccuracy))
    && (item.mistakeId === undefined || (typeof item.mistakeId === 'string' && /^field-\d{3}$/.test(item.mistakeId)))
    && (item.hintLevel === undefined || (isNonNegativeInteger(item.hintLevel) && item.hintLevel >= 1 && item.hintLevel <= 3))
    && isNonNegativeInteger(item.retryCount)
    && typeof item.completed === 'boolean'
}

function isBehaviorLog(value: unknown, seed: number): value is BehaviorLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BehaviorLog>
  if (item.version !== 1 || item.seed !== seed || typeof item.sessionId !== 'string' || !/^s-[a-z0-9]+-[a-z0-9]{1,12}$/.test(item.sessionId)) return false
  if (typeof item.startedAt !== 'string' || !Number.isFinite(Date.parse(item.startedAt))) return false
  if (typeof item.exportedAt !== 'string' || !Number.isFinite(Date.parse(item.exportedAt))) return false
  if (!Array.isArray(item.events) || item.events.length > MAX_BEHAVIOR_EVENTS || !item.events.every((event) => isBehaviorEvent(event, seed, item.sessionId!))) return false
  const events = item.events
  return events.every((event, index) => index === 0 || event.elapsedMs >= events[index - 1].elapsedMs)
}

function isStorySession(value: unknown, seed: number): value is StorySessionData {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StorySessionData>
  if (item.version !== STORY_SESSION_VERSION || item.seed !== seed || !isGameState(item.state, seed)) return false
  const state = item.state
  if (!ENTRY_PHASES.has(item.entryPhase as EntryPhase)) return false
  if (!optionalString(item.selectedMistake) || !optionalString(item.observationAnswer) || !optionalString(item.suspectSampleId)) return false
  if (!optionalString(item.boundaryProbeAnswer) || !optionalString(item.successPrediction) || !optionalString(item.evidenceInference)) return false
  if (!optionalString(item.overfitReflection) || !optionalString(item.finalReflection)) return false
  if (!Array.isArray(item.sensorReads) || !item.sensorReads.every((feature) => FEATURES.has(feature as FeatureKey))) return false
  if (!Array.isArray(item.repairSensorReads) || !item.repairSensorReads.every((feature) => FEATURES.has(feature as FeatureKey))) return false
  if (typeof item.modelConfirmed !== 'boolean') return false
  if (item.suspiciousAttemptId !== undefined && !isNonNegativeInteger(item.suspiciousAttemptId)) return false
  if (!Array.isArray(item.experimentLog) || !item.experimentLog.every(isExperimentRecord)) return false
  if (!item.experimentLog.every((record, index) => record.id === index + 1)) return false
  if (item.experimentLog.length !== state.auditHistory.length) return false
  if (!item.experimentLog.every((record, index) => {
    const audit = state.auditHistory[index]
    return audit && record.auditAccuracy === audit.accuracy && record.errors === audit.errorCount
  })) return false
  if (state.audit) {
    const latest = state.auditHistory.at(-1)
    if (!latest || latest.accuracy !== state.audit.accuracy || latest.errorCount !== state.audit.errorCount) return false
  }
  if (item.pendingPrediction !== undefined && !PREDICTIONS.has(item.pendingPrediction)) return false
  if (!isNonNegativeInteger(item.emergencyAudits) || !isNonNegativeInteger(item.reasoningMisses)) return false
  if (item.behaviorLog !== undefined && !isBehaviorLog(item.behaviorLog, seed)) return false
  if (item.selectedMistake !== undefined && !state.audit?.mistakes.some((mistake) => mistake.id === item.selectedMistake)) return false
  if (item.suspiciousAttemptId !== undefined && !item.experimentLog.some((record) => record.id === item.suspiciousAttemptId)) return false
  return true
}

function stripMistakeFlags(result: AuditResult): AuditResult {
  return {
    ...result,
    mistakes: result.mistakes.map(({ flags: _flags, ...mistake }) => mistake),
  }
}

function sanitizeState(state: GameState): GameState {
  return {
    ...state,
    debug: false,
    training: state.training ? { ...state.training, params: undefined } : undefined,
    audit: state.audit ? stripMistakeFlags(state.audit) : undefined,
    auditHistory: state.auditHistory.map(stripMistakeFlags),
    diagnostics: [],
  }
}

export function storySessionKey(seed: number) {
  return `aia.story-session.v${STORY_SESSION_VERSION}.${seed}`
}

export function storyAuditCredits(session: Pick<StorySessionData, 'experimentLog' | 'emergencyAudits'>) {
  const paidAudits = Math.max(0, session.experimentLog.length - 1)
  return Math.max(0, 4 + session.emergencyAudits - paidAudits)
}

export function storySessionHasProgress(session: Pick<StorySessionData, 'entryPhase' | 'state' | 'experimentLog'>) {
  return session.entryPhase !== 'title' || session.state.stage !== 'briefing' || session.experimentLog.length > 0
}

export function readStorySession(storage: StorageLike, seed: number): StorySessionData | undefined {
  const key = storySessionKey(seed)
  try {
    const raw = storage.getItem(key)
    if (!raw) return undefined
    if (raw.length > MAX_STORY_SESSION_BYTES) {
      storage.removeItem(key)
      return undefined
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isStorySession(parsed, seed)) {
      storage.removeItem(key)
      return undefined
    }
    return parsed
  } catch {
    try { storage.removeItem(key) } catch { /* storage can be unavailable */ }
    return undefined
  }
}

export function writeStorySession(storage: StorageLike, session: StorySessionData) {
  try {
    const sanitized: StorySessionData = { ...session, state: sanitizeState(session.state) }
    const serialized = JSON.stringify(sanitized)
    if (serialized.length > MAX_STORY_SESSION_BYTES) return false
    storage.setItem(storySessionKey(session.seed), serialized)
    return true
  } catch {
    return false
  }
}

export function clearStorySession(storage: StorageLike, seed: number) {
  try {
    storage.removeItem(storySessionKey(seed))
    return true
  } catch {
    return false
  }
}
