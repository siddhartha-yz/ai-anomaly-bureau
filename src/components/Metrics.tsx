import { MODEL_META, type ModelId } from '../ml/registry'
import type { AuditResult, TrainingResult } from '../game/types'

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function Metrics({ training, audit, model }: { training?: TrainingResult; audit?: AuditResult; model: ModelId }) {
  return (
    <section className="metrics" aria-label="模型表现">
      <article>
        <span>TRAIN_CHECK</span>
        <strong>{training ? pct(training.accuracy) : '—'}</strong>
        <small>{training ? `旧样本：${training.errorCount} 个误判` : '等待训练'}</small>
      </article>
      <article>
        <span>UNKNOWN_AUDIT</span>
        <strong>{audit ? pct(audit.accuracy) : '锁定'}</strong>
        <small>{audit ? `新样本：${audit.errorCount} 个误判` : '等待现场审计'}</small>
      </article>
      <article>
        <span>MODEL_LOAD</span>
        <strong className="metric-word">{MODEL_META[model].complexityLabel}</strong>
        <small>{MODEL_META[model].nickname}</small>
      </article>
    </section>
  )
}
