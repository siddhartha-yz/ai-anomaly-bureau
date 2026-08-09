import { FEATURE_META } from '../ml/features'
import { MODEL_META, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'

export type ExperimentRecord = {
  id: number
  model: ModelId
  features: [FeatureKey, FeatureKey]
  trainAccuracy: number
  auditAccuracy: number
  errors: number
}

export function CaseAttempts({ records }: { records: ExperimentRecord[] }) {
  if (records.length === 0) return null

  return (
    <section className="case-attempts" aria-label="本案实验记录">
      <div className="case-attempts-head"><span>CASE_NOTES.LOG</span><strong>已经试过 {records.length} 个方案</strong></div>
      <div className="case-attempt-list">
        {records.map((record, index) => (
          <article className={`case-attempt ${index === records.length - 1 ? 'latest' : ''}`} key={record.id}>
            <span className="case-attempt-index">{String(record.id).padStart(2, '0')}</span>
            <div className="case-attempt-copy">
              <strong>{MODEL_META[record.model].label}</strong>
              <span>{record.features.map((feature) => FEATURE_META[feature].label).join(' + ')}</span>
            </div>
            <div className="case-attempt-score">
              <span>旧 {Math.round(record.trainAccuracy * 100)}%</span>
              <b>新 {Math.round(record.auditAccuracy * 100)}%</b>
              <span>{record.errors} 错</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
