import { createDecisionGrid } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import type { EndlessCase } from './generator'

export type EndlessAudit = ReturnType<EndlessCase['audit']>

export function EndlessPlot({ caseData, features, model, trained, audit, showArchiveAlerts = false, selectedArchiveId, selectedFieldErrorId, onArchiveSelect }: {
  caseData: EndlessCase
  features: [FeatureKey, FeatureKey]
  model: ModelId
  trained: boolean
  audit?: EndlessAudit
  showArchiveAlerts?: boolean
  selectedArchiveId?: string
  selectedFieldErrorId?: string
  onArchiveSelect?: (id: string) => void
}) {
  const W = 660
  const H = 430
  const pad = 46
  const x = (value: number) => pad + value * (W - pad * 2)
  const y = (value: number) => H - pad - value * (H - pad * 2)
  const trainPoints = projectSamples(caseData.train, features)
  const fitted = trained ? MODEL_REGISTRY[model].fit(trainPoints) : undefined
  const grid = fitted ? createDecisionGrid(fitted, 20) : []
  const predictionById = new Map(audit?.predictions.map((item) => [item.id, item.predicted]))
  const mistakeIds = new Set(audit?.mistakes.map((item) => item.id) ?? [])
  const resolution = grid.length ? Math.round(Math.sqrt(grid.length)) : 0
  const cw = resolution ? (W - pad * 2) / resolution : 0
  const ch = resolution ? (H - pad * 2) / resolution : 0

  return (
    <section className="endless-plot-card">
      <div className="endless-panel-head"><span>FIELD_MATRIX.EXE</span><strong>{caseData.featureNames[features[0]]} × {caseData.featureNames[features[1]]}</strong></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="无尽案件训练与现场样本图">
        <rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} className="endless-plot-bg" />
        <g className="endless-grid-field">
          {grid.map((cell) => (
            <rect key={`${cell.x}-${cell.y}`} x={x(cell.x) - cw / 2} y={y(cell.y) - ch / 2} width={cw} height={ch} className={`endless-cell ${cell.label}`} />
          ))}
        </g>
        {trainPoints.map((point) => (
          <g
            key={point.id}
            className={`${showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? 'endless-archive-anomaly' : ''} ${selectedArchiveId === point.id ? 'selected' : ''}`}
            role={showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? 'button' : undefined}
            tabIndex={showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? 0 : undefined}
            aria-label={showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? `查看档案异常 ${point.id}` : undefined}
            onClick={showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? () => onArchiveSelect?.(point.id) : undefined}
            onKeyDown={showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onArchiveSelect?.(point.id)
              }
            } : undefined}
          >
            {showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) && <title>历史档案采集质量告警：{point.id}</title>}
            {showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) && <rect x={x(point.x) - 14} y={y(point.y) - 14} width="28" height="28" className="endless-archive-hitbox" />}
            {point.label === 'cat'
              ? <rect x={x(point.x) - 5} y={y(point.y) - 5} width="10" height="10" className="endless-train-a" />
              : <path d={`M ${x(point.x)} ${y(point.y)-7} L ${x(point.x)+7} ${y(point.y)+6} L ${x(point.x)-7} ${y(point.y)+6} Z`} className="endless-train-b" />}
            {showArchiveAlerts && (point.source.flags?.noise || point.source.flags?.qualityAlert) && (
              <>
                <rect x={x(point.x) - 10} y={y(point.y) - 10} width="20" height="20" className="endless-archive-anomaly-frame" />
                <text x={x(point.x) + 9} y={y(point.y) - 9} className="endless-archive-anomaly-mark">!</text>
              </>
            )}
          </g>
        ))}
        {audit && caseData.publicTest.map((sample) => {
          const px = x(sample.features[features[0]])
          const py = y(sample.features[features[1]])
          const predicted = predictionById.get(sample.id)
          const isMistake = mistakeIds.has(sample.id)
          const selected = selectedFieldErrorId === sample.id
          return (
            <g key={sample.id} className={`endless-field-sample ${isMistake ? 'mistake' : ''} ${selected ? 'selected' : ''}`}>
              <rect x={px - 5} y={py - 5} width="10" height="10" transform={`rotate(45 ${px} ${py})`} className={`endless-field-point ${predicted ?? ''}`} />
              {isMistake && <rect x={px - 10} y={py - 10} width="20" height="20" className="endless-field-error-frame" />}
              {selected && <circle cx={px} cy={py} r="15" className="endless-field-error-selected" />}
            </g>
          )
        })}
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} className="endless-axis" />
        <line x1={pad} y1={pad} x2={pad} y2={H-pad} className="endless-axis" />
      </svg>
      <div className="endless-axis-copy"><span>X / {caseData.featureNames[features[0]]}</span><span>Y / {caseData.featureNames[features[1]]}</span></div>
      <div className="endless-legend">
        <span><i className="shape-a" /> {caseData.classNames.cat}</span>
        <span><i className="shape-b" /> {caseData.classNames.bread}</span>
        {audit && <span><i className="shape-field" /> 现场未知样本（按模型判断着色）</span>}
        {showArchiveAlerts && caseData.archiveAlerts.length > 0 && <span><i className="shape-archive-alert">!</i> 历史档案采集质量告警</span>}
      </div>
    </section>
  )
}
