import type { ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'

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

export function accuracyBand(value: number): BandPrediction {
  if (value >= .85) return 'high'
  if (value >= .60) return 'mid'
  return 'low'
}
