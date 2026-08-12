import type { ModelId } from '../ml/registry'
import { MODEL_REGISTRY } from '../ml/registry'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import type { FeatureKey, Label } from '../ml/types'
import { createEndlessCase, type EndlessCaseLeadId, type EndlessSyndrome } from './generator'
import { accuracyBand, earnedCaseLeadReviewCount, type BandPrediction, type CaseLeadPrediction, type CaseLeadPredictions, type CausalPrediction, type EndlessRunRecord, type InspectedFieldError } from './uiTypes'

export const ENDLESS_SESSION_VERSION = 6
const PREVIOUS_ENDLESS_SESSION_VERSION = 5
const SECONDARY_ENDLESS_SESSION_VERSION = 4
const TERTIARY_ENDLESS_SESSION_VERSION = 3
const QUATERNARY_ENDLESS_SESSION_VERSION = 2
const LEGACY_ENDLESS_SESSION_VERSION = 1

export type EndlessSessionData = {
  version: typeof ENDLESS_SESSION_VERSION
  seed: number
  features: [FeatureKey, FeatureKey]
  activeSlot: 0 | 1
  model: ModelId
  trained: boolean
  prediction?: BandPrediction
  causalPrediction?: CausalPrediction
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
  inspectedCaseLeadIds: EndlessCaseLeadId[]
  caseLeadPredictions?: CaseLeadPredictions
  inspectedFieldErrors: InspectedFieldError[]
  solved: boolean
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const FEATURES = new Set<FeatureKey>(['warmth', 'roundness', 'texture', 'aspect'])
const MODELS = new Set<ModelId>(['linear', 'tree', 'knn-1', 'knn-5'])
const PREDICTIONS = new Set<BandPrediction>(['high', 'mid', 'low'])
const CAUSAL_PREDICTIONS = new Set<CausalPrediction>(['improved', 'degraded', 'null', 'material'])
const SYNDROMES = new Set<EndlessSyndrome>(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'])
const LABELS = new Set<Label>(['cat', 'bread'])
const OUTCOMES = new Set(['wrong', 'needs-reliable'] as const)
const CASE_LEADS = new Set<EndlessCaseLeadId>(['composition', 'batch', 'quality'])
const CASE_LEAD_PREDICTIONS = new Set<CaseLeadPrediction>(['signal', 'clear'])

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
    && optionalMember(item.causalPrediction, CAUSAL_PREDICTIONS)
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

function isCaseLeadPredictions(value: unknown): value is CaseLeadPredictions {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, prediction]) =>
    CASE_LEADS.has(key as EndlessCaseLeadId) && CASE_LEAD_PREDICTIONS.has(prediction as CaseLeadPrediction),
  )
}

function optionalMember<T extends string>(value: unknown, allowed: Set<T>) {
  return value === undefined || allowed.has(value as T)
}

function sameFeatureSet(a: [FeatureKey, FeatureKey], b: [FeatureKey, FeatureKey]) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

function sameRate(a: number, b: number) {
  return Math.abs(a - b) < 1e-9
}

function runMatchesGeneratedWorld(caseData: ReturnType<typeof createEndlessCase>, run: EndlessRunRecord) {
  const trainPoints = projectSamples(caseData.train, run.features)
  const train = evaluate(MODEL_REGISTRY[run.model].fit(trainPoints), trainPoints).accuracy
  const audit = caseData.audit(run.model, run.features)
  return sameRate(run.train, train)
    && sameRate(run.test, audit.accuracy)
    && run.errors === audit.errorCount
    && sameRate(run.recall.cat, audit.recall.cat)
    && sameRate(run.recall.bread, audit.recall.bread)
    && run.reliable === caseData.isReliable(audit)
    && run.predictionHit === (run.prediction === accuracyBand(audit.accuracy))
}

function fieldInspectionMatchesGeneratedWorld(caseData: ReturnType<typeof createEndlessCase>, history: EndlessRunRecord[], inspection: InspectedFieldError) {
  const run = history.find((item) => item.id === inspection.runId)
  if (!run) return false
  const mistake = caseData.audit(run.model, run.features).mistakes.find((item) => item.id === inspection.sampleId)
  return Boolean(mistake && mistake.actual === inspection.actual && mistake.predicted === inspection.predicted)
}

function isSessionData(value: unknown, seed: number): value is EndlessSessionData {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<EndlessSessionData>
  if (item.version !== ENDLESS_SESSION_VERSION || item.seed !== seed) return false
  if (!isFeaturePair(item.features) || (item.activeSlot !== 0 && item.activeSlot !== 1) || !MODELS.has(item.model as ModelId)) return false
  if (typeof item.trained !== 'boolean' || typeof item.auditComplete !== 'boolean' || typeof item.solved !== 'boolean') return false
  if (!optionalMember(item.prediction, PREDICTIONS) || !optionalMember(item.causalPrediction, CAUSAL_PREDICTIONS) || !optionalMember(item.diagnosis, SYNDROMES) || !optionalMember(item.submittedDiagnosis, SYNDROMES)) return false
  if (!optionalMember(item.lastDiagnosisOutcome, OUTCOMES as Set<'wrong' | 'needs-reliable'>)) return false
  if (!isNonNegativeInteger(item.emergencyCredits) || !isNonNegativeInteger(item.diagnosisAttempts)) return false
  if (!isNonNegativeInteger(item.lastDiagnosisConfigCount) || !isNonNegativeInteger(item.lastDiagnosisRunCount)) return false
  if (!Array.isArray(item.history) || !item.history.every(isRunRecord)) return false
  if (!Array.isArray(item.selectedEvidenceRunIds) || !item.selectedEvidenceRunIds.every(isNonNegativeInteger)) return false
  if (!Array.isArray(item.inspectedArchiveIds) || !item.inspectedArchiveIds.every((id) => typeof id === 'string')) return false
  if (!Array.isArray(item.inspectedCaseLeadIds) || !item.inspectedCaseLeadIds.every((id) => CASE_LEADS.has(id as EndlessCaseLeadId))) return false
  if (new Set(item.inspectedCaseLeadIds).size !== item.inspectedCaseLeadIds.length) return false
  if (!isCaseLeadPredictions(item.caseLeadPredictions)) return false
  if (!Array.isArray(item.inspectedFieldErrors) || !item.inspectedFieldErrors.every(isInspectedFieldError)) return false
  const history = item.history
  const caseData = createEndlessCase(seed)
  const runIds = new Set(history.map((run) => run.id))
  if (history.some((run, index) => run.id !== index + 1)) return false
  if (history.some((run) => !runMatchesGeneratedWorld(caseData, run))) return false
  if (item.lastDiagnosisRunCount > history.length || item.lastDiagnosisConfigCount > history.length) return false
  if (new Set(item.selectedEvidenceRunIds).size !== item.selectedEvidenceRunIds.length) return false
  if (item.selectedEvidenceRunIds.some((runId) => !runIds.has(runId))) return false
  if (item.inspectedFieldErrors.some((error) => !runIds.has(error.runId) || !fieldInspectionMatchesGeneratedWorld(caseData, history, error))) return false
  if (item.inspectedCaseLeadIds.length > earnedCaseLeadReviewCount(history)) return false
  if (item.diagnosisAttempts === 0) {
    if (item.submittedDiagnosis !== undefined || item.lastDiagnosisOutcome !== undefined) return false
    if (item.lastDiagnosisConfigCount !== 0 || item.lastDiagnosisRunCount !== 0) return false
  } else if (item.submittedDiagnosis === undefined) {
    return false
  }
  if (item.lastDiagnosisOutcome !== undefined && item.solved) return false
  if (item.solved) {
    if (item.diagnosisAttempts < 1) return false
    if (item.diagnosis !== caseData.diagnosis.correct || item.submittedDiagnosis !== caseData.diagnosis.correct) return false
    if (item.selectedEvidenceRunIds.length !== 2 || !history.some((run) => run.reliable)) return false
  }
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

function quaternaryEndlessSessionKey(seed: number) {
  return `aia.endless-session.v${QUATERNARY_ENDLESS_SESSION_VERSION}.${seed}`
}

function previousEndlessSessionKey(seed: number) {
  return `aia.endless-session.v${PREVIOUS_ENDLESS_SESSION_VERSION}.${seed}`
}

function secondaryEndlessSessionKey(seed: number) {
  return `aia.endless-session.v${SECONDARY_ENDLESS_SESSION_VERSION}.${seed}`
}

function tertiaryEndlessSessionKey(seed: number) {
  return `aia.endless-session.v${TERTIARY_ENDLESS_SESSION_VERSION}.${seed}`
}

export function hasEndlessSessionProgress(session: EndlessSessionData | undefined) {
  return Boolean(session && (
    session.history.length
    || session.trained
    || session.diagnosisAttempts
    || session.inspectedArchiveIds.length
    || session.inspectedCaseLeadIds.length
    || Object.keys(session.caseLeadPredictions ?? {}).length
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
    let raw = storage.getItem(key)
    if (!raw) {
      const previousKey = previousEndlessSessionKey(seed)
      const previousRaw = storage.getItem(previousKey)
      if (previousRaw) {
        let previous: Record<string, unknown>
        try {
          previous = JSON.parse(previousRaw) as Record<string, unknown>
        } catch {
          storage.removeItem(previousKey)
          return undefined
        }
        // V6 changes H-COVERAGE semantics by allowing a skewed upstream archive
        // pool even when the deployed training subset is balanced. Audit metrics
        // remain valid, but already-open source folders must be reopened so
        // restored evidence is never silently rewritten.
        const migrated: unknown = { ...previous, version: ENDLESS_SESSION_VERSION, inspectedCaseLeadIds: [] }
        if (!isSessionData(migrated, seed)) {
          storage.removeItem(previousKey)
          return undefined
        }
        raw = JSON.stringify(migrated)
        try {
          storage.setItem(key, raw)
          storage.removeItem(previousKey)
        } catch {
          return undefined
        }
      }
    }
    if (!raw) {
      const secondaryKey = secondaryEndlessSessionKey(seed)
      const secondaryRaw = storage.getItem(secondaryKey)
      if (secondaryRaw) {
        let previous: Record<string, unknown>
        try {
          previous = JSON.parse(secondaryRaw) as Record<string, unknown>
        } catch {
          storage.removeItem(secondaryKey)
          return undefined
        }
        const migrated: unknown = { ...previous, version: ENDLESS_SESSION_VERSION, inspectedCaseLeadIds: [] }
        if (!isSessionData(migrated, seed)) {
          storage.removeItem(secondaryKey)
          return undefined
        }
        raw = JSON.stringify(migrated)
        try {
          storage.setItem(key, raw)
          storage.removeItem(secondaryKey)
        } catch {
          return undefined
        }
      }
    }
    if (!raw) {
      const tertiaryKey = tertiaryEndlessSessionKey(seed)
      const tertiaryRaw = storage.getItem(tertiaryKey)
      if (tertiaryRaw) {
        let previous: Record<string, unknown>
        try {
          previous = JSON.parse(tertiaryRaw) as Record<string, unknown>
        } catch {
          storage.removeItem(tertiaryKey)
          return undefined
        }
        const migrated: unknown = { ...previous, version: ENDLESS_SESSION_VERSION, inspectedCaseLeadIds: [] }
        if (!isSessionData(migrated, seed)) {
          storage.removeItem(tertiaryKey)
          return undefined
        }
        raw = JSON.stringify(migrated)
        try {
          storage.setItem(key, raw)
          storage.removeItem(tertiaryKey)
        } catch {
          return undefined
        }
      }
    }
    if (!raw) {
      const quaternaryKey = quaternaryEndlessSessionKey(seed)
      const quaternaryRaw = storage.getItem(quaternaryKey)
      if (quaternaryRaw) {
        if (Math.abs(seed) % 4 === 2) {
          // V3 changed the generated distribution-shift field world; V2 shift
          // metrics therefore still cannot be restored into V6.
          storage.removeItem(quaternaryKey)
          return undefined
        }
        let previous: Record<string, unknown>
        try {
          previous = JSON.parse(quaternaryRaw) as Record<string, unknown>
        } catch {
          storage.removeItem(quaternaryKey)
          return undefined
        }
        const migrated: unknown = { ...previous, version: ENDLESS_SESSION_VERSION, inspectedCaseLeadIds: [] }
        if (!isSessionData(migrated, seed)) {
          storage.removeItem(quaternaryKey)
          return undefined
        }
        raw = JSON.stringify(migrated)
        try {
          storage.setItem(key, raw)
          storage.removeItem(quaternaryKey)
        } catch {
          return undefined
        }
      }
    }
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
    storage.removeItem(previousEndlessSessionKey(seed))
    storage.removeItem(secondaryEndlessSessionKey(seed))
    storage.removeItem(tertiaryEndlessSessionKey(seed))
    storage.removeItem(quaternaryEndlessSessionKey(seed))
    storage.removeItem(legacyEndlessSessionKey(seed))
    return true
  } catch {
    return false
  }
}
