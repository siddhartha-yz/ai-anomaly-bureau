import type { ExperimentRecord } from '../components/CaseAttempts'
import type { ExperimentPrediction } from '../components/ExperimentPlan'
import type { EntryPhase } from '../components/EntryExperience'
import { LEVEL_META, TRANSFER_QUESTION } from '../content/level1'
import { createDataset } from '../ml/data'
import { MODEL_REGISTRY, type ModelId } from '../ml/registry'
import type { FeatureKey, Label, RawFeatures } from '../ml/types'
import { predictionMatches } from './experiment'
import { MAX_BEHAVIOR_LOG_EVENTS, type BehaviorEvent, type BehaviorLog } from './logging'
import type { AuditResult, GameState, MistakeDetail, Stage, TrainingResult } from './types'

export const STORY_SESSION_VERSION = 1
const MAX_STORY_SESSION_BYTES = 200_000

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
const OBSERVATION_ANSWERS = new Set(['clusters', 'mixed', 'random'])
const BOUNDARY_PROBE_ANSWERS = new Set(['cat', 'bread'])
const SUCCESS_PREDICTIONS = new Set(['fixed', 'need-new'])
const EVIDENCE_INFERENCES = new Set(['feature-gap', 'random-bad-luck', 'need-score'])
const OVERFIT_REFLECTIONS = new Set(['memorized', 'not-enough-score', 'new-data-invalid'])
const FINAL_REFLECTIONS = new Set(['unknown-stable', 'highest-train', 'complex-model'])
const INITIAL_SENSOR_READS = new Set<FeatureKey>(['warmth', 'roundness'])
const REPAIR_SENSOR_READS = new Set<FeatureKey>(['texture', 'aspect'])
const TRAINING_OUTLIER_IDS = new Set(['train-cat-16', 'train-cat-17', 'train-bread-16', 'train-bread-17'])
const STORY_STAGE_ORDER: Stage[] = [
  'briefing', 'inspect_data', 'choose_features', 'choose_model', 'train', 'first_success',
  'hidden_test', 'inspect_errors', 'iterate', 'overfit_reveal', 'final_audit', 'transfer_question', 'complete',
]
const STORY_STAGE_INDEX = new Map(STORY_STAGE_ORDER.map((stage, index) => [stage, index]))
const TRANSFER_OPTIONS: ReadonlyMap<string, boolean> = new Map(
  TRANSFER_QUESTION.options.map((option) => [option.id, option.correct]),
)

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
    && item.actual !== item.predicted
    && isRawFeatures(item.features)
    && item.flags === undefined
}

function isAuditResult(value: unknown): value is AuditResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<AuditResult>
  const confusion = item.confusion as Record<string, unknown> | undefined
  const confusionKeys = ['cat->cat', 'cat->bread', 'bread->cat', 'bread->bread'] as const
  if (!isRate(item.accuracy)
    || !isNonNegativeInteger(item.errorCount)
    || !confusion
    || Object.keys(confusion).length !== confusionKeys.length
    || !confusionKeys.every((key) => isNonNegativeInteger(confusion[key]))
    || !Array.isArray(item.mistakes)
    || item.errorCount !== item.mistakes.length
    || !item.mistakes.every(isMistake)
    || !isNonNegativeInteger(item.orangeCatErrors)
    || item.orangeCatErrors > item.errorCount) return false

  const catCat = confusion['cat->cat'] as number
  const catBread = confusion['cat->bread'] as number
  const breadCat = confusion['bread->cat'] as number
  const breadBread = confusion['bread->bread'] as number
  const total = catCat + catBread + breadCat + breadBread
  const errors = catBread + breadCat
  if (total <= 0 || item.errorCount !== errors) return false
  if (Math.abs(item.accuracy - (total - errors) / total) > 1e-9) return false

  const mistakes = item.mistakes as MistakeDetail[]
  if (new Set(mistakes.map((mistake) => mistake.id)).size !== mistakes.length) return false
  const catBreadMistakes = mistakes.filter((mistake) => mistake.actual === 'cat' && mistake.predicted === 'bread').length
  const breadCatMistakes = mistakes.filter((mistake) => mistake.actual === 'bread' && mistake.predicted === 'cat').length
  return catBreadMistakes === catBread && breadCatMistakes === breadCat
}

function sameRawFeatures(a: RawFeatures, b: RawFeatures) {
  return [...FEATURES].every((feature) => a[feature] === b[feature])
}

function sameAuditResult(a: AuditResult, b: AuditResult) {
  if (a.accuracy !== b.accuracy || a.errorCount !== b.errorCount || a.orangeCatErrors !== b.orangeCatErrors) return false
  const confusionKeys = ['cat->cat', 'cat->bread', 'bread->cat', 'bread->bread'] as const
  if (!confusionKeys.every((key) => a.confusion[key] === b.confusion[key])) return false
  if (a.mistakes.length !== b.mistakes.length) return false
  const byId = new Map(b.mistakes.map((mistake) => [mistake.id, mistake]))
  return a.mistakes.every((mistake) => {
    const other = byId.get(mistake.id)
    return Boolean(other
      && mistake.actual === other.actual
      && mistake.predicted === other.predicted
      && mistake.correct === other.correct
      && sameRawFeatures(mistake.features, other.features))
  })
}

function isTrainingStateConsistent(state: GameState, seed: number): boolean {
  if (!state.training) return true
  const trainCount = createDataset(seed).train.length
  if (state.training.errorCount > trainCount) return false
  const expectedAccuracy = (trainCount - state.training.errorCount) / trainCount
  return Math.abs(state.training.accuracy - expectedAccuracy) <= 1e-9
    && state.training.complexity === MODEL_REGISTRY[state.selectedModel].complexity
}

function isStageStateConsistent(state: GameState): boolean {
  const hasTraining = state.training !== undefined
  const hasAudit = state.audit !== undefined
  const finalAuditPassed = Boolean(
    state.audit
      && state.audit.accuracy >= LEVEL_META.successTestAccuracy
      && state.audit.orangeCatErrors <= LEVEL_META.maxOrangeCatErrors,
  )

  if (state.viewedMistakes.length > 0) {
    if (state.stage !== 'inspect_errors' || !state.audit) return false
    const mistakeIds = new Set(state.audit.mistakes.map((mistake) => mistake.id))
    if (new Set(state.viewedMistakes).size !== state.viewedMistakes.length) return false
    if (!state.viewedMistakes.every((id) => mistakeIds.has(id))) return false
  }

  switch (state.stage) {
    case 'briefing':
    case 'inspect_data':
    case 'choose_features':
    case 'choose_model':
      return !hasTraining && !hasAudit && state.auditHistory.length === 0 && !state.hasSeenOverfit
    case 'train':
      return !hasAudit && state.auditHistory.length === 0 && !state.hasSeenOverfit
    case 'first_success':
    case 'hidden_test':
      return hasTraining && state.training!.accuracy >= 0.8 && !hasAudit && state.auditHistory.length === 0 && !state.hasSeenOverfit
    case 'inspect_errors':
      return hasTraining && hasAudit && state.audit!.errorCount > 0 && state.auditHistory.length > 0 && !state.hasSeenOverfit
    case 'iterate':
      return state.auditHistory.length > 0
    case 'overfit_reveal':
      return hasTraining
        && hasAudit
        && state.hasSeenOverfit
        && state.selectedModel === 'knn-1'
        && state.training!.accuracy >= 0.98
        && state.audit!.accuracy < state.training!.accuracy - 0.08
    case 'final_audit':
    case 'transfer_question':
    case 'complete':
      return hasTraining && hasAudit && state.hasSeenOverfit && finalAuditPassed
    default:
      return true
  }
}

function isGameState(value: unknown, seed: number): value is GameState {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<GameState>
  const transferStage = item.stage === 'transfer_question' || item.stage === 'complete'
  const transferAnswerValid = item.transferAnswer === undefined && item.transferCorrect === undefined
    ? true
    : typeof item.transferAnswer === 'string'
      && typeof item.transferCorrect === 'boolean'
      && TRANSFER_OPTIONS.get(item.transferAnswer) === item.transferCorrect
  const transferStateValid = transferAnswerValid
    && (transferStage || (item.transferAnswer === undefined && item.transferCorrect === undefined))
  const completionStateValid = item.stage === 'complete'
    ? isFiniteNumber(item.completedAt)
      && isFiniteNumber(item.startedAt)
      && item.completedAt >= item.startedAt
      && typeof item.transferAnswer === 'string'
      && item.transferCorrect === true
    : item.completedAt === undefined
  const structurallyValid = item.seed === seed
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
    && transferStateValid
    && isFiniteNumber(item.startedAt)
    && completionStateValid
    && Array.isArray(item.diagnostics)
    && item.diagnostics.every((message) => typeof message === 'string')

  return structurallyValid
    && isTrainingStateConsistent(item as GameState, seed)
    && isStageStateConsistent(item as GameState)
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

function isExperimentLogConsistent(records: ExperimentRecord[]) {
  if (records.length === 0) return true
  if (records[0].prediction !== undefined || records[0].predictionMatched !== undefined) return false
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index]
    const previous = records[index - 1]
    if (record.prediction === undefined) return false
    if (record.predictionMatched !== predictionMatches(record.prediction, record.trainAccuracy, record.auditAccuracy, previous)) return false
  }
  return true
}

function optionalChoice(value: unknown, choices: ReadonlySet<string>) {
  return value === undefined || (typeof value === 'string' && choices.has(value))
}

function isSensorReadList(value: unknown, allowed: ReadonlySet<FeatureKey>) {
  return Array.isArray(value)
    && value.length <= 2
    && new Set(value).size === value.length
    && value.every((feature) => allowed.has(feature as FeatureKey))
}

function isStoryMicroStateConsistent(session: StorySessionData): boolean {
  const { state } = session
  const stageIndex = STORY_STAGE_INDEX.get(state.stage)
  if (stageIndex === undefined) return false
  const atLeast = (stage: Stage) => stageIndex >= STORY_STAGE_INDEX.get(stage)!

  if (!atLeast('inspect_data')) {
    if (session.observationAnswer !== undefined || session.suspectSampleId !== undefined) return false
  } else if (atLeast('choose_features')) {
    if (session.observationAnswer !== 'clusters' || !session.suspectSampleId || !TRAINING_OUTLIER_IDS.has(session.suspectSampleId)) return false
  }

  if (!atLeast('choose_features')) {
    if (session.sensorReads.length !== 0) return false
  } else if (atLeast('choose_model') && session.sensorReads.length !== 2) return false

  if (!atLeast('choose_model')) {
    if (session.modelConfirmed) return false
  } else if (atLeast('train') && !session.modelConfirmed) return false

  if (!atLeast('first_success')) {
    if (session.boundaryProbeAnswer !== undefined || session.successPrediction !== undefined) return false
  } else if (atLeast('hidden_test')) {
    if (session.boundaryProbeAnswer === undefined || session.successPrediction === undefined) return false
  }

  const initialAuditHadErrors = (state.auditHistory[0]?.errorCount ?? 0) > 0
  if (!atLeast('inspect_errors')) {
    if (session.evidenceInference !== undefined) return false
  } else if (state.stage !== 'inspect_errors' && initialAuditHadErrors && session.evidenceInference !== 'feature-gap') return false

  if (session.pendingPrediction !== undefined) {
    if (state.stage !== 'iterate') return false
    if (!state.hasSeenOverfit && state.selectedModel !== 'knn-1') return false
    if (state.hasSeenOverfit && session.repairSensorReads.length !== 2) return false
  }

  if (!atLeast('overfit_reveal')) {
    if (session.suspiciousAttemptId !== undefined || session.overfitReflection !== undefined || session.repairSensorReads.length !== 0) return false
  } else if (state.stage === 'overfit_reveal') {
    if (session.repairSensorReads.length !== 0) return false
  } else if (state.hasSeenOverfit) {
    const suspiciousRecord = session.experimentLog.find((record) => record.id === session.suspiciousAttemptId)
    if (!suspiciousRecord
      || suspiciousRecord.model !== 'knn-1'
      || suspiciousRecord.trainAccuracy < 0.98
      || suspiciousRecord.auditAccuracy >= suspiciousRecord.trainAccuracy - 0.08
      || session.overfitReflection !== 'memorized') return false
  }

  if (atLeast('final_audit') && session.repairSensorReads.length !== 2) return false
  if (!atLeast('final_audit')) {
    if (session.finalReflection !== undefined) return false
  } else if (atLeast('transfer_question') && session.finalReflection !== 'unknown-stable') return false

  return true
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
    && item.completed === (item.stage === 'complete')
}

function isBehaviorLog(value: unknown, seed: number): value is BehaviorLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BehaviorLog>
  if (item.version !== 1 || item.seed !== seed || typeof item.sessionId !== 'string' || !/^s-[a-z0-9]+-[a-z0-9]{1,12}$/.test(item.sessionId)) return false
  if (typeof item.startedAt !== 'string' || !Number.isFinite(Date.parse(item.startedAt))) return false
  if (typeof item.exportedAt !== 'string' || !Number.isFinite(Date.parse(item.exportedAt))) return false
  if (!Array.isArray(item.events) || item.events.length > MAX_BEHAVIOR_LOG_EVENTS || !item.events.every((event) => isBehaviorEvent(event, seed, item.sessionId!))) return false
  if (item.droppedEvents !== undefined && !isNonNegativeInteger(item.droppedEvents)) return false

  const startedAt = Date.parse(item.startedAt)
  const exportedAt = Date.parse(item.exportedAt)
  if (exportedAt < startedAt) return false
  if ((item.droppedEvents ?? 0) > 0 && item.events.length !== MAX_BEHAVIOR_LOG_EVENTS) return false

  return item.events.every((event, index) => {
    const timestamp = Date.parse(event.timestamp)
    if (timestamp < startedAt || timestamp > exportedAt) return false
    if (event.elapsedMs !== timestamp - startedAt) return false
    return index === 0 || event.elapsedMs >= item.events![index - 1].elapsedMs
  })
}

function isStorySession(value: unknown, seed: number): value is StorySessionData {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<StorySessionData>
  if (item.version !== STORY_SESSION_VERSION || item.seed !== seed || !isGameState(item.state, seed)) return false
  const state = item.state
  if (!ENTRY_PHASES.has(item.entryPhase as EntryPhase)) return false
  if (item.entryPhase === 'game' ? state.stage === 'briefing' : state.stage !== 'briefing') return false
  if (item.selectedMistake !== undefined && (typeof item.selectedMistake !== 'string' || !/^field-\d{3}$/.test(item.selectedMistake))) return false
  if (!optionalChoice(item.observationAnswer, OBSERVATION_ANSWERS)) return false
  if (item.suspectSampleId !== undefined && (typeof item.suspectSampleId !== 'string' || !/^train-(cat|bread)-\d{1,3}$/.test(item.suspectSampleId))) return false
  if (!optionalChoice(item.boundaryProbeAnswer, BOUNDARY_PROBE_ANSWERS)) return false
  if (!optionalChoice(item.successPrediction, SUCCESS_PREDICTIONS)) return false
  if (!optionalChoice(item.evidenceInference, EVIDENCE_INFERENCES)) return false
  if (!optionalChoice(item.overfitReflection, OVERFIT_REFLECTIONS)) return false
  if (!optionalChoice(item.finalReflection, FINAL_REFLECTIONS)) return false
  if (!isSensorReadList(item.sensorReads, INITIAL_SENSOR_READS)) return false
  if (!isSensorReadList(item.repairSensorReads, REPAIR_SENSOR_READS)) return false
  if (typeof item.modelConfirmed !== 'boolean') return false
  if (item.suspiciousAttemptId !== undefined && !isNonNegativeInteger(item.suspiciousAttemptId)) return false
  if (!Array.isArray(item.experimentLog) || !item.experimentLog.every(isExperimentRecord)) return false
  if (!item.experimentLog.every((record, index) => record.id === index + 1)) return false
  if (!isExperimentLogConsistent(item.experimentLog)) return false
  if (item.experimentLog.length !== state.auditHistory.length) return false
  if (!item.experimentLog.every((record, index) => {
    const audit = state.auditHistory[index]
    return audit && record.auditAccuracy === audit.accuracy && record.errors === audit.errorCount
  })) return false
  if (state.audit) {
    const latest = state.auditHistory.at(-1)
    const latestRecord = item.experimentLog.at(-1)
    if (!latest || !sameAuditResult(latest, state.audit)) return false
    if (!state.training || !latestRecord) return false
    if (latestRecord.model !== state.selectedModel
      || latestRecord.features[0] !== state.selectedFeatures[0]
      || latestRecord.features[1] !== state.selectedFeatures[1]
      || latestRecord.trainAccuracy !== state.training.accuracy) return false
  }
  if (item.pendingPrediction !== undefined && !PREDICTIONS.has(item.pendingPrediction)) return false
  if (!isNonNegativeInteger(item.emergencyAudits) || !isNonNegativeInteger(item.reasoningMisses)) return false
  const paidAudits = Math.max(0, item.experimentLog.length - 1)
  const maxEarnedEmergencyAudits = Math.max(0, paidAudits - 3)
  if (item.emergencyAudits > maxEarnedEmergencyAudits) return false
  if (item.behaviorLog !== undefined && !isBehaviorLog(item.behaviorLog, seed)) return false
  if (item.selectedMistake !== undefined && !state.audit?.mistakes.some((mistake) => mistake.id === item.selectedMistake)) return false
  if (item.suspiciousAttemptId !== undefined && !item.experimentLog.some((record) => record.id === item.suspiciousAttemptId)) return false
  return isStoryMicroStateConsistent(item as StorySessionData)
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
    if (!isStorySession(sanitized, session.seed)) return false
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
