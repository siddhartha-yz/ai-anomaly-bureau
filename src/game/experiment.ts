import type { ExperimentRecord } from '../components/CaseAttempts'
import type { ExperimentPrediction } from '../components/ExperimentPlan'

export function predictionMatches(
  prediction: ExperimentPrediction | undefined,
  trainAccuracy: number,
  auditAccuracy: number,
  previous?: Pick<ExperimentRecord, 'trainAccuracy' | 'auditAccuracy'>,
): boolean | undefined {
  if (!prediction || prediction === 'no-idea' || !previous) return undefined
  if (prediction === 'train-up-test-down') {
    return trainAccuracy > previous.trainAccuracy + 0.04 && auditAccuracy < previous.auditAccuracy - 0.01
  }
  if (prediction === 'test-improves') {
    return auditAccuracy > previous.auditAccuracy + 0.08
  }
  if (prediction === 'both-improve') {
    return trainAccuracy > previous.trainAccuracy + 0.01 && auditAccuracy > previous.auditAccuracy + 0.01
  }
  return undefined
}
