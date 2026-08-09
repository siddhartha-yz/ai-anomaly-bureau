import { createRng } from '../ml/rng'
import type { FeatureKey } from '../ml/types'
import { ENDLESS_FEATURE_PAIRS, ENDLESS_MODELS, createEndlessCase, type EndlessCase, type EndlessSyndrome } from './generator'
import { contradictionRate, evidenceFeatureScore, featureObservation } from './observables'

export type PolicyResult = {
  solved: boolean
  audits: number
  bestAccuracy: number
  diagnosis: EndlessSyndrome
}

export function simulateEvidencePolicy(caseData: EndlessCase): PolicyResult {
  const ranked = (['warmth', 'roundness', 'texture', 'aspect'] as FeatureKey[])
    .map((feature) => ({ feature, score: evidenceFeatureScore(caseData, feature) }))
    .sort((a, b) => b.score - a.score)
  const features: [FeatureKey, FeatureKey] = [ranked[0].feature, ranked[1].feature]

  // The policy deliberately starts simple. It only smooths with k=5 when labeled
  // training geometry contains points that sit substantially closer to the opposite
  // class centroid. No hidden syndrome/test label is available to this policy.
  const contradiction = contradictionRate(caseData, features)
  const model = contradiction > .07 ? 'knn-5' : 'linear'
  const audit = caseData.audit(model, features)

  // Formal endless requires at least two distinct configurations before a
  // diagnosis can be submitted. The policy therefore collects a cheap baseline
  // first; if its preferred evidence configuration happens to equal the default,
  // it uses the same fields with a different simple model as the baseline.
  const preferredKey = `${model}:${[...features].sort().join('+')}`
  const baselineChoice = ENDLESS_FEATURE_PAIRS
    .flatMap((baselineFeatures) => ENDLESS_MODELS.map((baselineModel) => ({ features: baselineFeatures, model: baselineModel })))
    .find((choice) => `${choice.model}:${[...choice.features].sort().join('+')}` !== preferredKey)!
  const baselineAudit = caseData.audit(baselineChoice.model, baselineChoice.features)

  // Diagnosis is inferred only from things a player can inspect: unlabeled field
  // distribution movement and contradictory labeled old samples.
  const maxShift = Math.max(...(['warmth', 'roundness', 'texture', 'aspect'] as FeatureKey[])
    .map((feature) => featureObservation(caseData, feature).drift))
  const catCount = caseData.train.filter((sample) => sample.label === 'cat').length
  const breadCount = caseData.train.length - catCount
  const classRatio = Math.max(catCount, breadCount) / Math.max(1, Math.min(catCount, breadCount))
  let diagnosis: EndlessSyndrome
  if (classRatio >= 3) diagnosis = 'class-imbalance'
  else if (maxShift > .13) diagnosis = 'distribution-shift'
  else if (contradiction > .07) diagnosis = 'overfit-noise'
  else diagnosis = 'feature-gap'

  return {
    solved: (caseData.isReliable(audit) || caseData.isReliable(baselineAudit)) && diagnosis === caseData.diagnosis.correct,
    audits: 2,
    bestAccuracy: Math.max(audit.accuracy, baselineAudit.accuracy),
    diagnosis,
  }
}

export function simulateRandomPolicy(caseData: EndlessCase, policySeed: number, budget = 5): PolicyResult {
  const rng = createRng(policySeed)
  const choices = ENDLESS_FEATURE_PAIRS.flatMap((features) => ENDLESS_MODELS.map((model) => ({ features, model })))
  const shuffled = [...choices].sort(() => rng() - .5)
  let bestAccuracy = 0
  let foundReliable = false
  for (let index = 0; index < Math.min(budget, shuffled.length); index += 1) {
    const choice = shuffled[index]
    const audit = caseData.audit(choice.model, choice.features)
    bestAccuracy = Math.max(bestAccuracy, audit.accuracy)
    foundReliable ||= caseData.isReliable(audit)
  }
  const diagnoses: EndlessSyndrome[] = ['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']
  const diagnosis = diagnoses[Math.floor(rng() * diagnoses.length)]
  return {
    solved: foundReliable && diagnosis === caseData.diagnosis.correct,
    audits: Math.min(budget, shuffled.length),
    bestAccuracy,
    diagnosis,
  }
}

export function evaluatePolicyGap(caseSeeds: number[], randomTrialsPerCase = 20) {
  let evidenceSolved = 0
  let randomSolved = 0
  let randomRuns = 0
  let evidenceAccuracy = 0
  let randomAccuracy = 0

  for (const seed of caseSeeds) {
    const caseData = createEndlessCase(seed)
    const evidence = simulateEvidencePolicy(caseData)
    if (evidence.solved) evidenceSolved += 1
    evidenceAccuracy += evidence.bestAccuracy

    for (let trial = 0; trial < randomTrialsPerCase; trial += 1) {
      const random = simulateRandomPolicy(caseData, seed * 1009 + trial)
      if (random.solved) randomSolved += 1
      randomAccuracy += random.bestAccuracy
      randomRuns += 1
    }
  }

  return {
    evidenceSolveRate: evidenceSolved / caseSeeds.length,
    randomSolveRate: randomSolved / randomRuns,
    evidenceMeanBestAccuracy: evidenceAccuracy / caseSeeds.length,
    randomMeanBestAccuracy: randomAccuracy / randomRuns,
  }
}
