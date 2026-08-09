import { FEATURE_META } from '../ml/features'
import type { AuditResult } from '../game/types'
import type { FeatureKey, Label } from '../ml/types'

const LABEL: Record<Label, string> = { cat: '猫', bread: '面包' }

export function ErrorSamples({
  audit,
  selectedFeatures,
  viewed,
  selectedId,
  onSelect,
}: {
  audit?: AuditResult
  selectedFeatures: [FeatureKey, FeatureKey]
  viewed: string[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (!audit) return null
  return (
    <section className="mistakes" aria-labelledby="mistakes-title">
      <div className="section-heading-row">
        <h2 id="mistakes-title">错误样本</h2>
        <span>{audit.errorCount} 个</span>
      </div>
      {audit.mistakes.length === 0 ? (
        <p className="empty-state">这次没有误判。继续比较模型是否稳定。</p>
      ) : (
        <div className="mistake-list">
          {audit.mistakes.map((mistake) => (
            <button
              type="button"
              key={mistake.id}
              className={`mistake-row ${selectedId === mistake.id ? 'selected' : ''}`}
              onClick={() => onSelect(mistake.id)}
            >
              <span className={`sample-mark ${mistake.actual}`}>{mistake.actual === 'cat' ? '●' : '■'}</span>
              <span className="mistake-copy">
                <strong>{LABEL[mistake.actual]} → 被判断为{LABEL[mistake.predicted]}</strong>
                <small>
                  {FEATURE_META[selectedFeatures[0]].short} {mistake.features[selectedFeatures[0]].toFixed(2)} ·{' '}
                  {FEATURE_META[selectedFeatures[1]].short} {mistake.features[selectedFeatures[1]].toFixed(2)}
                </small>
              </span>
              <span className="view-state">{viewed.includes(mistake.id) ? '已查' : '查看'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
