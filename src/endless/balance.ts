import { createRng } from '../ml/rng'
import type { FeatureKey } from '../ml/types'
import { ENDLESS_FEATURE_PAIRS, ENDLESS_MODELS, createEndlessCase, type EndlessCase, type EndlessSyndrome } from './generator'
import { contradictionRate, evidenceFeatureScore, featureObservation } from './observables'

export type PolicyResult = {
  solved: boolean
  audits: number
  bestAccuracy: number
  diagnosis: EndlessSyndrome
  discriminating: boolean
}

export function simulateEvidencePolicy(caseData: EndlessCase): PolicyResult {
  const baselineAudit = caseData.audit(caseData.baseline.model, caseData.baseline.features)
  const ranked = (['warmth', 'roundness', 'texture', 'aspect'] as FeatureKey[])
    .map((feature) => ({ feature, score: evidenceFeatureScore(caseData, feature) }))
    .sort((a, b) => b.score - a.score)
  const robustFeatures: [FeatureKey, FeatureKey] = [ranked[0].feature, ranked[1].feature]
  const robustContradiction = contradictionRate(caseData, robustFeatures)

  // Diagnosis is inferred only from things a player can inspect: unlabeled field
  // distribution movement, archive quality flags, class composition and
  // contradictory labeled old samples on a more informative projection.
  const maxShift = Math.max(...(['warmth', 'roundness', 'texture', 'aspect'] as FeatureKey[])
    .map((feature) => featureObservation(caseData, feature).drift))
  const catCount = caseData.train.filter((sample) => sample.label === 'cat').length
  const breadCount = caseData.train.length - catCount
  const classRatio = Math.max(catCount, breadCount) / Math.max(1, Math.min(catCount, breadCount))
  let diagnosis: EndlessSyndrome
  if (classRatio >= 3) diagnosis = 'class-imbalance'
  else if (maxShift > .13) diagnosis = 'distribution-shift'
  else if (caseData.archiveAlerts.length > 0 && robustContradiction > .07) diagnosis = 'overfit-noise'
  else diagnosis = 'feature-gap'

  // Run 2 is deliberately a single-variable intervention. The policy does not
  // search hidden field outcomes: class imbalance prioritizes changing what the
  // model can see; a KNN-1 deployment with archive quality flags tests smoothing;
  // otherwise it holds the model fixed and changes only the observation fields.
  let secondModel = caseData.baseline.model
  let secondFeatures = caseData.baseline.features
  if (classRatio >= 3) secondFeatures = robustFeatures
  else if (caseData.archiveAlerts.length > 0 && caseData.baseline.model === 'knn-1') secondModel = 'knn-5'
  else secondFeatures = robustFeatures
  const secondAudit = caseData.audit(secondModel, secondFeatures)
  const baselineMinRecall = Math.min(baselineAudit.recall.cat, baselineAudit.recall.bread)
  const secondMinRecall = Math.min(secondAudit.recall.cat, secondAudit.recall.bread)
  let discriminating = Math.max(
    secondAudit.accuracy - baselineAudit.accuracy,
    secondMinRecall - baselineMinRecall,
  ) >= .12

  let audits = 2
  let bestAccuracy = Math.max(baselineAudit.accuracy, secondAudit.accuracy)
  let reliableFound = caseData.isReliable(secondAudit)
  if (!caseData.isReliable(secondAudit) || !discriminating) {
    audits = 3
    const thirdFeatures = robustFeatures
    const thirdModel = diagnosis === 'overfit-noise' ? 'knn-5'
      : diagnosis === 'class-imbalance' ? 'linear'
        : robustContradiction > .07 ? 'knn-5'
          : 'linear'
    const thirdAudit = caseData.audit(thirdModel, thirdFeatures)
    const thirdMinRecall = Math.min(thirdAudit.recall.cat, thirdAudit.recall.bread)
    const controlledThird = secondModel === thirdModel || secondFeatures.every((feature) => thirdFeatures.includes(feature))
    if (controlledThird) {
      discriminating ||= Math.max(
        thirdAudit.accuracy - secondAudit.accuracy,
        thirdMinRecall - secondMinRecall,
      ) >= .12
    }
    reliableFound ||= caseData.isReliable(thirdAudit)
    bestAccuracy = Math.max(bestAccuracy, thirdAudit.accuracy)
  }

  return {
    solved: reliableFound && diagnosis === caseData.diagnosis.correct && discriminating,
    audits,
    bestAccuracy,
    diagnosis,
    discriminating,
  }
}

export function simulateRandomPolicy(caseData: EndlessCase, policySeed: number, budget = 5): PolicyResult {
  const rng = createRng(policySeed)
  const baselineKey = `${caseData.baseline.model}:${[...caseData.baseline.features].sort().join('+')}`
  const choices = ENDLESS_FEATURE_PAIRS
    .flatMap((features) => ENDLESS_MODELS.map((model) => ({ features, model })))
    .filter((choice) => `${choice.model}:${[...choice.features].sort().join('+')}` !== baselineKey)
  const shuffled = [...choices].sort(() => rng() - .5)
  const baselineAudit = caseData.audit(caseData.baseline.model, caseData.baseline.features)
  let bestAccuracy = baselineAudit.accuracy
  let foundReliable = caseData.isReliable(baselineAudit)
  for (let index = 0; index < Math.min(Math.max(0, budget - 1), shuffled.length); index += 1) {
    const choice = shuffled[index]
    const audit = caseData.audit(choice.model, choice.features)
    bestAccuracy = Math.max(bestAccuracy, audit.accuracy)
    foundReliable ||= caseData.isReliable(audit)
  }
  const diagnoses: EndlessSyndrome[] = ['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance']
  const diagnosis = diagnoses[Math.floor(rng() * diagnoses.length)]
  return {
    solved: foundReliable && diagnosis === caseData.diagnosis.correct,
    audits: Math.min(budget, shuffled.length + 1),
    bestAccuracy,
    diagnosis,
    discriminating: false,
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
