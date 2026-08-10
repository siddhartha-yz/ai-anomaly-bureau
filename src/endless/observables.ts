import type { FeatureKey } from '../ml/types'
import type { EndlessCase } from './generator'

export function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

export function std(values: number[]) {
  const center = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)))
}

export function featureObservation(caseData: EndlessCase, feature: FeatureKey) {
  const cats = caseData.train.filter((sample) => sample.label === 'cat').map((sample) => sample.features[feature])
  const breads = caseData.train.filter((sample) => sample.label === 'bread').map((sample) => sample.features[feature])
  const train = caseData.train.map((sample) => sample.features[feature])
  const field = caseData.publicTest.map((sample) => sample.features[feature])
  const separation = Math.abs(mean(cats) - mean(breads))
  const drift = Math.abs(mean(train) - mean(field)) + Math.abs(std(train) - std(field))
  return {
    separation,
    drift,
    separationLevel: Math.max(0, Math.min(5, Math.round(separation / .11))),
    driftLevel: Math.max(0, Math.min(5, Math.round(drift / .035))),
  }
}

export function contradictionRate(caseData: EndlessCase, features: [FeatureKey, FeatureKey]) {
  const cats = caseData.train.filter((sample) => sample.label === 'cat')
  const breads = caseData.train.filter((sample) => sample.label === 'bread')
  const centroid = (samples: typeof cats) => ({
    x: mean(samples.map((sample) => sample.features[features[0]])),
    y: mean(samples.map((sample) => sample.features[features[1]])),
  })
  const catCenter = centroid(cats)
  const breadCenter = centroid(breads)
  const distance = (sample: (typeof cats)[number], center: { x: number; y: number }) =>
    Math.hypot(sample.features[features[0]] - center.x, sample.features[features[1]] - center.y)
  const contradictory = caseData.train.filter((sample) => {
    const own = sample.label === 'cat' ? catCenter : breadCenter
    const other = sample.label === 'cat' ? breadCenter : catCenter
    return distance(sample, other) + .05 < distance(sample, own)
  }).length
  return contradictory / Math.max(1, caseData.train.length)
}

export function evidenceFeatureScore(caseData: EndlessCase, feature: FeatureKey) {
  const observed = featureObservation(caseData, feature)
  // Strong old-data separation is useful, but a sensor whose unlabeled field
  // distribution visibly moves is a suspicious shortcut. Formal Duty no longer
  // prints this as a ready-made score; the automated policy uses it as a compact
  // proxy for what a player can inspect by cycling FIELD MATRIX projections.
  return observed.separation - observed.drift * 5
}
