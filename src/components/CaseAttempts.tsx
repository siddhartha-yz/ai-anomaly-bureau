import { FEATURE_META } from '../ml/features'
import { MODEL_META, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import type { ExperimentPrediction } from './ExperimentPlan'

export type ExperimentRecord = {
  id: number
  model: ModelId
  features: [FeatureKey, FeatureKey]
  trainAccuracy: number
  auditAccuracy: number
  errors: number
  prediction?: ExperimentPrediction
  predictionMatched?: boolean
}

function AttemptBody({ record }: { record: ExperimentRecord }) {
  return (
    <>
      <span className="case-attempt-index">{String(record.id).padStart(2, '0')}</span>
      <span className="case-attempt-copy">
        <strong>{MODEL_META[record.model].label}</strong>
        <span>{FEATURE_META[record.features[0]].label} + {FEATURE_META[record.features[1]].label}</span>
      </span>
      <span className="case-attempt-score">
        <span>旧 {Math.round(record.trainAccuracy * 100)}%</span>
        <b>新 {Math.round(record.auditAccuracy * 100)}%</b>
        <span>{record.errors} 错</span>
        {record.prediction && (
          <em className={record.predictionMatched === undefined ? '' : record.predictionMatched ? 'prediction-hit' : 'prediction-miss'}>
            预测 {record.predictionMatched === undefined ? '?' : record.predictionMatched ? '✓' : '×'}
          </em>
        )}
      </span>
    </>
  )
}

export function CaseAttempts({
  records,
  credits,
  emergencyAudits = 0,
  selectedId,
  onSelect,
  selectionPrompt,
}: {
  records: ExperimentRecord[]
  credits?: number
  emergencyAudits?: number
  selectedId?: number
  onSelect?: (id: number) => void
  selectionPrompt?: string
}) {
  if (records.length === 0) return null
  return (
    <section className="case-attempts" aria-label="案件实验记录">
      <div className="case-attempts-head">
        <span>CASE_NOTES.LOG</span>
        <strong>已经试过 {records.length} 个方案{credits !== undefined ? ` · 正式审计剩 ${credits}` : ''}{emergencyAudits ? ` · 额外 ${emergencyAudits}` : ''}</strong>
      </div>
      {selectionPrompt && <div className="case-attempt-selection-prompt">⌖ {selectionPrompt}</div>}
      <div className="case-attempt-list">
        {records.map((record, index) => {
          const className = `case-attempt ${index === records.length - 1 ? 'latest' : ''} ${onSelect ? 'selectable' : ''} ${selectedId === record.id ? 'selected' : ''}`
          return onSelect ? (
            <button type="button" className={className} key={record.id} onClick={() => onSelect(record.id)} aria-pressed={selectedId === record.id}>
              <AttemptBody record={record} />
            </button>
          ) : (
            <article className={className} key={record.id}>
              <AttemptBody record={record} />
            </article>
          )
        })}
      </div>
    </section>
  )
}
