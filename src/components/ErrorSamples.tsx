import { FEATURE_META } from '../ml/features'
import type { AuditResult } from '../game/types'
import type { FeatureKey, Label } from '../ml/types'
import { PixelEvidenceSprite } from './PixelGlyphs'

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
  const selected = audit.mistakes.find((mistake) => mistake.id === selectedId) ?? audit.mistakes[0]

  if (audit.mistakes.length === 0) {
    return (
      <section className="mistakes evidence-console evidence-clear" aria-labelledby="mistakes-title">
        <div className="evidence-console-head">
          <span>EVIDENCE.LOG</span>
          <strong id="mistakes-title">NO MISCLASSIFICATION</strong>
        </div>
        <p className="empty-state">这次没有误判。继续比较模型面对未知数据时是否稳定。</p>
      </section>
    )
  }

  return (
    <section className="mistakes evidence-console" aria-labelledby="mistakes-title">
      <div className="evidence-console-head">
        <span>EVIDENCE.LOG</span>
        <strong id="mistakes-title">发现 {audit.errorCount} 个误判</strong>
      </div>

      {selected && (
        <div className="evidence-card" aria-live="polite">
          <div className="evidence-visual">
            <div className="evidence-id">EVIDENCE / {selected.id.toUpperCase()}</div>
            <PixelEvidenceSprite label={selected.actual} />
            <div className="evidence-classification">
              <span><small>TRUE</small><b>{LABEL[selected.actual]}</b></span>
              <i>→</i>
              <span className="wrong-output"><small>MODEL</small><b>{LABEL[selected.predicted]}</b></span>
            </div>
          </div>

          <div className="evidence-readout">
            <span className="evidence-kicker">CURRENT SENSOR READOUT</span>
            {selectedFeatures.map((feature) => {
              const value = selected.features[feature]
              return (
                <div className="evidence-feature" key={feature}>
                  <div className="evidence-feature-label">
                    <span>{FEATURE_META[feature].label}</span>
                    <code>{value.toFixed(2)}</code>
                  </div>
                  <div className="pixel-meter"><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>
                </div>
              )
            })}
            <p>模型只能依据当前装载的两个传感器判断。换一组特征后，这张证据在扫描图中的位置也会改变。</p>
          </div>
        </div>
      )}

      <div className="evidence-strip" aria-label="误判样本列表">
        {audit.mistakes.map((mistake, index) => (
          <button
            type="button"
            key={mistake.id}
            className={`evidence-tab ${selected?.id === mistake.id ? 'selected' : ''}`}
            onClick={() => onSelect(mistake.id)}
          >
            <span className="evidence-tab-index">{String(index + 1).padStart(2, '0')}</span>
            <span className={`evidence-mini-glyph ${mistake.actual}`}>{mistake.actual === 'cat' ? '⌃' : '▰'}</span>
            <span>{LABEL[mistake.actual]}→{LABEL[mistake.predicted]}</span>
            <i>{viewed.includes(mistake.id) ? 'CHECKED' : 'OPEN'}</i>
          </button>
        ))}
      </div>
    </section>
  )
}
