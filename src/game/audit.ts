import { createDataset } from '../ml/data'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import type { FittedClassifier, FeatureKey, PublicSample, Sample } from '../ml/types'
import type { AuditResult } from './types'

export type AuditService = {
  train: Sample[]
  publicTest: PublicSample[]
  audit(model: FittedClassifier, features: readonly [FeatureKey, FeatureKey]): AuditResult
  debugTest(): Sample[]
}

export function createAuditService(seed: number): AuditService {
  const dataset = createDataset(seed)
  const publicIdByInternal = new Map(dataset.test.map((sample, index) => [sample.id, `field-${String(index + 1).padStart(3, '0')}`]))
  const publicId = (internalId: string) => {
    const id = publicIdByInternal.get(internalId)
    if (!id) throw new Error(`Missing public id for ${internalId}`)
    return id
  }
  const publicTest: PublicSample[] = dataset.test.map((sample) => ({
    id: publicId(sample.id),
    split: sample.split,
    features: { ...sample.features },
  }))

  return {
    train: dataset.train,
    publicTest,
    audit(model, features) {
      const points = projectSamples(dataset.test, features)
      const result = evaluate(model, points)
      const byId = new Map(dataset.test.map((sample) => [sample.id, sample]))
      const mistakes = result.mistakes.map((prediction) => {
        const sample = byId.get(prediction.id)
        if (!sample) throw new Error(`Missing test sample ${prediction.id}`)
        return {
          ...prediction,
          id: publicId(prediction.id),
          features: { ...sample.features },
          flags: sample.flags
            ? {
                orangeCat: sample.flags.orangeCat,
                roundBread: sample.flags.roundBread,
                auditProbe: sample.flags.auditProbe,
              }
            : undefined,
        }
      })
      return {
        accuracy: result.accuracy,
        errorCount: result.errorCount,
        confusion: result.confusion,
        mistakes,
        orangeCatErrors: mistakes.filter((mistake) => mistake.flags?.orangeCat).length,
      }
    },
    debugTest() {
      return dataset.test.map((sample) => ({
        ...sample,
        id: publicId(sample.id),
        features: { ...sample.features },
      }))
    },
  }
}
