import type { ModelId } from '../ml/registry'
import type { FeatureKey, Label } from '../ml/types'
import type { EndlessCaseLead, EndlessCaseLeadId, EndlessSyndrome } from './generator'

export type BandPrediction = 'high' | 'mid' | 'low'
// `material` is retained only so in-progress v6 sessions created before directional
// preregistration can still resume. New UI writes improved/degraded/null.
export type CausalPrediction = 'improved' | 'degraded' | 'null' | 'material'

export type EndlessRunRecord = {
  id: number
  model: ModelId
  features: [FeatureKey, FeatureKey]
  train: number
  test: number
  errors: number
  prediction: BandPrediction
  predictionHit: boolean
  causalPrediction?: CausalPrediction
  recall: { cat: number; bread: number }
  reliable: boolean
}

export type InspectedFieldError = { runId: number; sampleId: string; actual: Label; predicted: Label }

export type ExperimentDelta = 'baseline' | 'repeat' | 'fields-only' | 'model-only' | 'mixed'
export type HypothesisAxisStatus = 'open' | 'supported' | 'weakened' | 'contested'
export type InterventionAxis = 'fields' | 'model'

export type DiagnosisEvidenceStatus = {
  records: EndlessRunRecord[]
  distinctConfigurations: number
  includesFreshEvidence: boolean
  sequentialExperiment: boolean
  reachesReliableEndpoint: boolean
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
  direction: 'improved' | 'degraded' | 'flat' | 'tradeoff'
  discriminating: boolean
}

function sameFeatureSet(a: [FeatureKey, FeatureKey], b: [FeatureKey, FeatureKey]) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

export function experimentConfigKey(model: ModelId, features: [FeatureKey, FeatureKey]) {
  return `${model}:${[...features].sort().join('+')}`
}

export function diagnosisInterventionAxis(diagnosis: EndlessSyndrome): InterventionAxis {
  return diagnosis === 'overfit-noise' ? 'model' : 'fields'
}

export function diagnosisSourceLeadId(diagnosis: EndlessSyndrome): EndlessCaseLeadId | undefined {
  if (diagnosis === 'overfit-noise') return 'quality'
  if (diagnosis === 'distribution-shift') return 'batch'
  if (diagnosis === 'class-imbalance') return 'composition'
  return undefined
}

export function diagnosisSourceSupported(
  diagnosis: EndlessSyndrome,
  inspectedLeadIds: EndlessCaseLeadId[],
  leadSources: EndlessCaseLead[],
) {
  const requiredLeadId = diagnosisSourceLeadId(diagnosis)
  if (!requiredLeadId) return true
  if (!inspectedLeadIds.includes(requiredLeadId)) return false
  return leadSources.find((lead) => lead.id === requiredLeadId)?.result === 'signal'
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
  const firstIndex = records.length === 2 ? history.indexOf(records[0]) : -1
  const secondIndex = records.length === 2 ? history.indexOf(records[1]) : -1
  const sequentialExperiment = firstIndex >= 0 && secondIndex === firstIndex + 1
  const reachesReliableEndpoint = records.some((record) => record.reliable)
  return {
    records,
    distinctConfigurations,
    includesFreshEvidence,
    sequentialExperiment,
    reachesReliableEndpoint,
    ready: records.length === 2 && distinctConfigurations === 2 && includesFreshEvidence && sequentialExperiment && reachesReliableEndpoint,
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
  const metricTradeoff = Math.abs(comparison.fieldDelta) >= .12
    && Math.abs(comparison.minRecallDelta) >= .12
    && Math.sign(comparison.fieldDelta) !== Math.sign(comparison.minRecallDelta)
  return {
    ...comparison,
    axis,
    materialChange,
    direction: metricTradeoff ? 'tradeoff'
      : strongestDelta > 0 ? 'improved'
        : strongestDelta < 0 ? 'degraded'
          : 'flat',
    discriminating: Boolean(axis && materialChange >= .12),
  }
}

export function causalPredictionResult(first: EndlessRunRecord, second: EndlessRunRecord) {
  const comparison = discriminatingExperiment(first, second)
  if (!comparison.axis || !second.causalPrediction) return undefined
  const observed: Exclude<CausalPrediction, 'material'> | 'tradeoff' = comparison.discriminating
    ? comparison.direction === 'flat' ? 'null' : comparison.direction
    : 'null'
  return {
    expected: second.causalPrediction,
    observed,
    hit: second.causalPrediction === 'material' ? observed !== 'null' : second.causalPrediction === observed,
  }
}

export function causalForecastStats(history: EndlessRunRecord[]) {
  let total = 0
  let hits = 0
  for (let index = 1; index < history.length; index += 1) {
    const result = causalPredictionResult(history[index - 1], history[index])
    if (!result) continue
    total += 1
    if (result.hit) hits += 1
  }
  return { total, hits, misses: total - hits }
}

export function preRegisteredNullResult(first: EndlessRunRecord, second: EndlessRunRecord) {
  const result = causalPredictionResult(first, second)
  return Boolean(result && result.observed === 'null')
}

export function competingAxisNullResult(
  history: EndlessRunRecord[],
  support: { first: EndlessRunRecord; second: EndlessRunRecord; comparison: DiscriminatingComparison } | undefined,
  afterRunId = 0,
) {
  const supportedAxis = support?.comparison.axis
  if (!supportedAxis) return undefined
  const competingAxis = supportedAxis === 'fields' ? 'model' : 'fields'
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const comparison = discriminatingExperiment(history[index - 1], history[index])
    if (comparison.axis !== competingAxis) continue
    const nullFirst = history[index - 1]
    const nullSecond = history[index]
    const sharesSupportEndpoint = [nullFirst, nullSecond].some((record) =>
      [support.first, support.second].some((endpoint) =>
        record.model === endpoint.model && sameFeatureSet(record.features, endpoint.features),
      ),
    )
    if (!sharesSupportEndpoint) continue
    if (preRegisteredNullResult(history[index - 1], history[index])) {
      return { first: history[index - 1], second: history[index], comparison }
    }
  }
  return undefined
}

export function latestDiscriminatingExperiment(history: EndlessRunRecord[], afterRunId = 0) {
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const comparison = discriminatingExperiment(history[index - 1], history[index])
    if (comparison.discriminating) return { first: history[index - 1], second: history[index], comparison }
  }
  return undefined
}

export function latestReliableDiscriminatingExperiment(history: EndlessRunRecord[], afterRunId = 0) {
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const first = history[index - 1]
    const second = history[index]
    const comparison = discriminatingExperiment(first, second)
    if (comparison.discriminating && (first.reliable || second.reliable)) return { first, second, comparison }
  }
  return undefined
}

export function latestFalsifiedDiscriminatingExperiment(history: EndlessRunRecord[], afterRunId = 0, requireReliableEndpoint = false) {
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (history[index].id <= afterRunId) continue
    const first = history[index - 1]
    const second = history[index]
    const comparison = discriminatingExperiment(first, second)
    if (!comparison.discriminating) continue
    if (requireReliableEndpoint && !first.reliable && !second.reliable) continue
    const support = { first, second, comparison }
    const falsification = competingAxisNullResult(history, support, afterRunId)
    if (falsification) return { support, falsification }
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

export function hypothesisAxisStatus(history: EndlessRunRecord[], axis: 'fields' | 'model'): HypothesisAxisStatus {
  let hasMaterial = false
  let hasNull = false
  for (let index = 1; index < history.length; index += 1) {
    const comparison = discriminatingExperiment(history[index - 1], history[index])
    if (comparison.axis !== axis) continue
    if (comparison.discriminating) hasMaterial = true
    else hasNull = true
  }
  if (hasMaterial && hasNull) return 'contested'
  if (hasMaterial) return 'supported'
  if (hasNull) return 'weakened'
  return 'open'
}

export function accuracyBand(value: number): BandPrediction {
  if (value >= .85) return 'high'
  if (value >= .60) return 'mid'
  return 'low'
}
