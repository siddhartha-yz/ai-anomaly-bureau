import { MODEL_META, type ModelId } from '../ml/registry'
import type { AuditResult, TrainingResult } from '../game/types'

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function Metrics({ training, audit, model }: { training?: TrainingResult; audit?: AuditResult; model: ModelId }) {
  return (
    <section className="metrics" aria-label="模型表现">
      <article>
        <span>训练表现</span>
        <strong>{training ? pct(training.accuracy) : '—'}</strong>
        <small>{training ? `${training.errorCount} 个旧样本误判` : '训练后显示'}</small>
      </article>
      <article>
        <span>未知数据表现</span>
        <strong>{audit ? pct(audit.accuracy) : '锁定'}</strong>
        <small>{audit ? `${audit.errorCount} 个新样本误判` : '审计后揭示'}</small>
      </article>
      <article>
        <span>模型复杂度</span>
        <strong className="metric-word">{MODEL_META[model].complexityLabel}</strong>
        <small>{MODEL_META[model].nickname}</small>
      </article>
    </section>
  )
}
