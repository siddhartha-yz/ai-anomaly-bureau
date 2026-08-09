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
  const publicTest: PublicSample[] = dataset.test.map(({ label: _label, ...sample }) => sample)

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
      return dataset.test.map((sample) => ({ ...sample, features: { ...sample.features } }))
    },
  }
}
