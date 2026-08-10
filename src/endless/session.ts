import type { ModelId } from '../ml/registry'
import type { FeatureKey, Label } from '../ml/types'
import type { EndlessSyndrome } from './generator'
import type { BandPrediction, EndlessRunRecord, InspectedFieldError } from './uiTypes'

export const ENDLESS_SESSION_VERSION = 2
const LEGACY_ENDLESS_SESSION_VERSION = 1

export type EndlessSessionData = {
  version: typeof ENDLESS_SESSION_VERSION
  seed: number
  features: [FeatureKey, FeatureKey]
  activeSlot: 0 | 1
  model: ModelId
  trained: boolean
  prediction?: BandPrediction
  auditComplete: boolean
  emergencyCredits: number
  history: EndlessRunRecord[]
  diagnosis?: EndlessSyndrome
  diagnosisAttempts: number
  lastDiagnosisConfigCount: number
  lastDiagnosisRunCount: number
  selectedEvidenceRunIds: number[]
  submittedDiagnosis?: EndlessSyndrome
  lastDiagnosisOutcome?: 'wrong' | 'needs-reliable'
  inspectedArchiveIds: string[]
  inspectedFieldErrors: InspectedFieldError[]
  solved: boolean
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const FEATURES = new Set<FeatureKey>(['warmth', 'roundness', 'texture', 'aspect'])
const MODELS = new Set<ModelId>(['linear', 'tree', 'knn-1', 'knn-5'])
const PREDICTIONS = new Set<BandPrediction>(['high', 'mid', 'low'])
const SYNDROMES = new Set<EndlessSyndrome>(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'])
const LABELS = new Set<Label>(['cat', 'bread'])
const OUTCOMES = new Set(['wrong', 'needs-reliable'] as const)

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0
}

function isFeaturePair(value: unknown): value is [FeatureKey, FeatureKey] {
  return Array.isArray(value)
    && value.length === 2
    && FEATURES.has(value[0] as FeatureKey)
    && FEATURES.has(value[1] as FeatureKey)
    && value[0] !== value[1]
}

function isRunRecord(value: unknown): value is EndlessRunRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<EndlessRunRecord>
  return isNonNegativeInteger(item.id)
    && item.id > 0
    && MODELS.has(item.model as ModelId)
    && isFeaturePair(item.features)
    && isRate(item.train)
    && isRate(item.test)
    && isNonNegativeInteger(item.errors)
    && PREDICTIONS.has(item.prediction as BandPrediction)
    && typeof item.predictionHit === 'boolean'
    && Boolean(item.recall)
    && isRate(item.recall?.cat)
    && isRate(item.recall?.bread)
    && typeof item.reliable === 'boolean'
}

function isInspectedFieldError(value: unknown): value is InspectedFieldError {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<InspectedFieldError>
  return isNonNegativeInteger(item.runId)
    && item.runId > 0
    && typeof item.sampleId === 'string'
    && item.sampleId.length > 0
    && LABELS.has(item.actual as Label)
    && LABELS.has(item.predicted as Label)
}

function optionalMember<T extends string>(value: unknown, allowed: Set<T>) {
  return value === undefined || allowed.has(value as T)
}

function sameFeatureSet(a: [FeatureKey, FeatureKey], b: [FeatureKey, FeatureKey]) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

function isSessionData(value: unknown, seed: number): value is EndlessSessionData {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<EndlessSessionData>
  if (item.version !== ENDLESS_SESSION_VERSION || item.seed !== seed) return false
  if (!isFeaturePair(item.features) || (item.activeSlot !== 0 && item.activeSlot !== 1) || !MODELS.has(item.model as ModelId)) return false
  if (typeof item.trained !== 'boolean' || typeof item.auditComplete !== 'boolean' || typeof item.solved !== 'boolean') return false
  if (!optionalMember(item.prediction, PREDICTIONS) || !optionalMember(item.diagnosis, SYNDROMES) || !optionalMember(item.submittedDiagnosis, SYNDROMES)) return false
  if (!optionalMember(item.lastDiagnosisOutcome, OUTCOMES as Set<'wrong' | 'needs-reliable'>)) return false
  if (!isNonNegativeInteger(item.emergencyCredits) || !isNonNegativeInteger(item.diagnosisAttempts)) return false
  if (!isNonNegativeInteger(item.lastDiagnosisConfigCount) || !isNonNegativeInteger(item.lastDiagnosisRunCount)) return false
  if (!Array.isArray(item.history) || !item.history.every(isRunRecord)) return false
  if (!Array.isArray(item.selectedEvidenceRunIds) || !item.selectedEvidenceRunIds.every(isNonNegativeInteger)) return false
  if (!Array.isArray(item.inspectedArchiveIds) || !item.inspectedArchiveIds.every((id) => typeof id === 'string')) return false
  if (!Array.isArray(item.inspectedFieldErrors) || !item.inspectedFieldErrors.every(isInspectedFieldError)) return false
  const history = item.history
  const runIds = new Set(history.map((run) => run.id))
  if (history.some((run, index) => run.id !== index + 1)) return false
  if (item.lastDiagnosisRunCount > history.length || item.lastDiagnosisConfigCount > history.length) return false
  if (new Set(item.selectedEvidenceRunIds).size !== item.selectedEvidenceRunIds.length) return false
  if (item.selectedEvidenceRunIds.some((runId) => !runIds.has(runId))) return false
  if (item.inspectedFieldErrors.some((error) => !runIds.has(error.runId))) return false
  if (item.auditComplete) {
    const latest = history.at(-1)
    if (!item.trained || !latest || latest.model !== item.model || !sameFeatureSet(latest.features, item.features)) return false
  }
  if (item.solved && history.length < 2) return false
  return true
}

export function endlessSessionKey(seed: number) {
  return `aia.endless-session.v${ENDLESS_SESSION_VERSION}.${seed}`
}

function legacyEndlessSessionKey(seed: number) {
  return `aia.endless-session.v${LEGACY_ENDLESS_SESSION_VERSION}.${seed}`
}

export function hasEndlessSessionProgress(session: EndlessSessionData | undefined) {
  return Boolean(session && (
    session.history.length
    || session.trained
    || session.diagnosisAttempts
    || session.inspectedArchiveIds.length
    || session.inspectedFieldErrors.length
    || session.solved
  ))
}

export function remainingEndlessAuditCredits(session: EndlessSessionData) {
  return Math.max(0, 5 + session.emergencyCredits - session.history.length)
}

export function readEndlessSession(storage: StorageLike, seed: number): EndlessSessionData | undefined {
  const key = endlessSessionKey(seed)
  try {
    const raw = storage.getItem(key)
    if (!raw) {
      // V2 changes the generated field probes and deployed baseline semantics.
      // An old V1 run history therefore cannot be mixed with the new world for
      // the same seed; discard it explicitly rather than silently restoring
      // metrics that were produced against a different field set.
      storage.removeItem(legacyEndlessSessionKey(seed))
      return undefined
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isSessionData(parsed, seed)) {
      storage.removeItem(key)
      return undefined
    }
    return parsed
  } catch {
    try { storage.removeItem(key) } catch { /* localStorage can be unavailable */ }
    return undefined
  }
}

export function writeEndlessSession(storage: StorageLike, session: EndlessSessionData) {
  try {
    storage.setItem(endlessSessionKey(session.seed), JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

export function clearEndlessSession(storage: StorageLike, seed: number) {
  try {
    storage.removeItem(endlessSessionKey(seed))
    storage.removeItem(legacyEndlessSessionKey(seed))
    return true
  } catch {
    return false
  }
}
