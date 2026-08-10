import type { ModelId } from '../ml/registry'
import type { FeatureKey, Label } from '../ml/types'

export type BandPrediction = 'high' | 'mid' | 'low'

export type EndlessRunRecord = {
  id: number
  model: ModelId
  features: [FeatureKey, FeatureKey]
  train: number
  test: number
  errors: number
  prediction: BandPrediction
  predictionHit: boolean
  recall: { cat: number; bread: number }
  reliable: boolean
}

export type InspectedFieldError = { runId: number; sampleId: string; actual: Label; predicted: Label }

export type ExperimentDelta = 'baseline' | 'repeat' | 'fields-only' | 'model-only' | 'mixed'

export type DiagnosisEvidenceStatus = {
  records: EndlessRunRecord[]
  distinctConfigurations: number
  includesFreshEvidence: boolean
  ready: boolean
}

export type ExperimentComparison = {
  delta: ExperimentDelta
  trainDelta: number
  fieldDelta: number
  minRecallDelta: number
  errorDelta: number
}

export type DiscriminatingComparison = ExperimentComparison & {
  axis?: 'fields' | 'model'
  materialChange: number
  direction: 'improved' | 'degraded' | 'flat'
  discriminating: boolean
}

function sameFeatureSet(a: [FeatureKey, FeatureKey], b: [FeatureKey, FeatureKey]) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

export function experimentConfigKey(model: ModelId, features: [FeatureKey, FeatureKey]) {
  return `${model}:${[...features].sort().join('+')}`
}

export function earnedCaseLeadReviewCount(history: EndlessRunRecord[]) {
  const seen = new Set<string>()
  let earned = 0
  history.forEach((record, index) => {
    const key = experimentConfigKey(record.model, record.features)
    if (seen.has(key)) return
    seen.add(key)
    if (index === 0) {
      earned += 1
      return
    }
    const delta = experimentDelta(history[index - 1], record)
    if (delta === 'fields-only' || delta === 'model-only') earned += 1
  })
  return earned
}

export function experimentDelta(previous: EndlessRunRecord | undefined, current: EndlessRunRecord): ExperimentDelta {
  return experimentPlanDelta(previous, current.model, current.features)
}

export function experimentPlanDelta(
  previous: EndlessRunRecord | undefined,
  model: ModelId,
  features: [FeatureKey, FeatureKey],
): ExperimentDelta {
  if (!previous) return 'baseline'
  const fieldsChanged = !sameFeatureSet(previous.features, features)
  const modelChanged = previous.model !== model
  if (!fieldsChanged && !modelChanged) return 'repeat'
  if (fieldsChanged && !modelChanged) return 'fields-only'
  if (!fieldsChanged && modelChanged) return 'model-only'
  return 'mixed'
}

export function diagnosisEvidenceStatus(
  history: EndlessRunRecord[],
  selectedRunIds: number[],
  lastDiagnosisRunCount = 0,
): DiagnosisEvidenceStatus {
  const selected = new Set(selectedRunIds)
  const records = history.filter((record) => selected.has(record.id))
  const distinctConfigurations = new Set(records.map((record) => experimentConfigKey(record.model, record.features))).size
  const includesFreshEvidence = lastDiagnosisRunCount === 0 || records.some((record) => record.id > lastDiagnosisRunCount)
  return {
    records,
    distinctConfigurations,
    includesFreshEvidence,
    ready: records.length === 2 && distinctConfigurations === 2 && includesFreshEvidence,
  }
}

export function compareExperimentRecords(first: EndlessRunRecord, second: EndlessRunRecord): ExperimentComparison {
  const minRecall = (record: EndlessRunRecord) => Math.min(record.recall.cat, record.recall.bread)
  return {
    delta: experimentDelta(first, second),
    trainDelta: second.train - first.train,
    fieldDelta: second.test - first.test,
    minRecallDelta: minRecall(second) - minRecall(first),
    errorDelta: second.errors - first.errors,
  }
}

export function discriminatingExperiment(first: EndlessRunRecord, second: EndlessRunRecord): DiscriminatingComparison {
  const comparison = compareExperimentRecords(first, second)
  const axis = comparison.delta === 'fields-only' ? 'fields'
    : comparison.delta === 'model-only' ? 'model'
      : undefined
  const strongestDelta = Math.abs(comparison.fieldDelta) >= Math.abs(comparison.minRecallDelta)
    ? comparison.fieldDelta
    : comparison.minRecallDelta
  const materialChange = Math.abs(strongestDelta)
  return {
    ...comparison,
    axis,
    materialChange,
    direction: strongestDelta > 0 ? 'improved' : strongestDelta < 0 ? 'degraded' : 'flat',
    discriminating: Boolean(axis && materialChange >= .12),
  }
}

export function latestDiscriminatingExperiment(history: EndlessRunRecord[], afterRunId = 0) {
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const comparison = discriminatingExperiment(history[index - 1], history[index])
    if (comparison.discriminating) return { first: history[index - 1], second: history[index], comparison }
  }
  return undefined
}

export function latestControlledExperiment(
  history: EndlessRunRecord[],
  axis: 'fields' | 'model',
  afterRunId = 0,
) {
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const comparison = discriminatingExperiment(history[index - 1], history[index])
    if (comparison.axis === axis) return { first: history[index - 1], second: history[index], comparison }
  }
  return undefined
}

export function accuracyBand(value: number): BandPrediction {
  if (value >= .85) return 'high'
  if (value >= .60) return 'mid'
  return 'low'
}
