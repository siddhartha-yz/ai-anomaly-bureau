import { FEATURE_META } from '../ml/features'
import type { AuditResult } from '../game/types'
import type { DecisionCell, FeatureKey, Point2D, PublicSample, Sample } from '../ml/types'
import { PixelSampleGlyph, PixelUnknownGlyph } from './PixelGlyphs'

const W = 760
const H = 520
const PAD = { l: 70, r: 28, t: 30, b: 66 }
const X = (value: number) => PAD.l + value * (W - PAD.l - PAD.r)
const Y = (value: number) => H - PAD.b - value * (H - PAD.t - PAD.b)

function unknownPoint(sample: PublicSample, features: [FeatureKey, FeatureKey]) {
  return { x: sample.features[features[0]], y: sample.features[features[1]] }
}

export function ScatterPlot({
  train,
  publicTest,
  debugTest,
  features,
  grid,
  audit,
  revealUnknown,
  debugShowLabels,
  selectedMistake,
  onSelectMistake,
}: {
  train: Point2D[]
  publicTest: PublicSample[]
  debugTest?: Sample[]
  features: [FeatureKey, FeatureKey]
  grid: DecisionCell[]
  audit?: AuditResult
  revealUnknown: boolean
  debugShowLabels: boolean
  selectedMistake?: string
  onSelectMistake?: (id: string) => void
}) {
  const resolution = grid.length ? Math.round(Math.sqrt(grid.length)) : 0
  const cellW = resolution ? (W - PAD.l - PAD.r) / resolution : 0
  const cellH = resolution ? (H - PAD.t - PAD.b) / resolution : 0
  const mistakeById = new Map(audit?.mistakes.map((mistake) => [mistake.id, mistake]))
  const debugById = new Map(debugTest?.map((sample) => [sample.id, sample]))

  return (
    <section className="plot-card pixel-scanner-card" aria-labelledby="plot-title">
      <div className="plot-heading">
        <div>
          <span className="plot-eyebrow">DATA_SCANNER.EXE</span>
          <h2 id="plot-title">样本扫描台</h2>
        </div>
        <div className="legend pixel-legend" aria-label="图例">
          <span><i className="legend-pixel-cat" /> 猫样本</span>
          <span><i className="legend-pixel-bread" /> 面包样本</span>
          {revealUnknown && <span><i className="legend-pixel-unknown">?</i> 未知样本</span>}
        </div>
      </div>

      <div className="scanner-channel-bar" aria-label="当前扫描通道">
        <span><b>X</b>{FEATURE_META[features[0]].label}</span>
        <span className="channel-link">DATA FIELD</span>
        <span><b>Y</b>{FEATURE_META[features[1]].label}</span>
      </div>

      <div className={`plot-wrap pixel-data-field ${grid.length ? 'has-decision-field' : ''}`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="训练样本、未知样本与模型决策边界像素扫描图">
          <defs>
            <pattern id="pixelGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" className="grid-line" fill="none" />
            </pattern>
            <clipPath id="dataFieldClip">
              <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
            </clipPath>
          </defs>

          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="plot-bg" />
          <g clipPath="url(#dataFieldClip)" shapeRendering="crispEdges" className="decision-pixel-field">
            {grid.map((cell) => (
              <rect
                key={`${cell.x}-${cell.y}`}
                x={X(cell.x) - cellW / 2 + 0.7}
                y={Y(cell.y) - cellH / 2 + 0.7}
                width={Math.max(1, cellW - 1.4)}
                height={Math.max(1, cellH - 1.4)}
                className={`decision-cell ${cell.label}`}
              />
            ))}
            {grid.length > 0 && <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height="18" className="decision-scan-line" />}
          </g>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="url(#pixelGrid)" className="pixel-grid-overlay" />

          <g className="training-glyphs">
            {train.map((point) => (
              <PixelSampleGlyph key={point.id} label={point.label} x={X(point.x)} y={Y(point.y)} scale={1.08} className="train-glyph" />
            ))}
          </g>

          {revealUnknown && (
            <g className="unknown-glyphs">
              {publicTest.map((sample) => {
                const point = unknownPoint(sample, features)
                const mistake = mistakeById.get(sample.id)
                const debugLabel = debugShowLabels ? debugById.get(sample.id)?.label : undefined
                const revealedLabel = mistake?.actual ?? debugLabel
                const selected = selectedMistake === sample.id
                const clickable = Boolean(mistake && onSelectMistake)
                return (
                  <g
                    key={sample.id}
                    className={`test-pixel-group ${mistake ? 'mistake' : ''} ${selected ? 'selected' : ''} ${clickable ? 'clickable' : ''}`}
                    onClick={clickable ? () => onSelectMistake?.(sample.id) : undefined}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={clickable ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') onSelectMistake?.(sample.id)
                    } : undefined}
                  >
                    {revealedLabel ? (
                      <PixelSampleGlyph label={revealedLabel} x={X(point.x)} y={Y(point.y)} scale={1.18} className="test-revealed-glyph" />
                    ) : (
                      <PixelUnknownGlyph x={X(point.x)} y={Y(point.y)} selected={selected} />
                    )}
                    {mistake && (
                      <g className="mistake-beacon" transform={`translate(${X(point.x)} ${Y(point.y)})`}>
                        <rect x="-12" y="-12" width="24" height="24" className="mistake-frame" />
                        <rect x="8" y="-16" width="8" height="8" className="mistake-bang-bg" />
                        <text x="12" y="-10" className="mistake-bang">!</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          )}

          <g className="pixel-axis" shapeRendering="crispEdges">
            <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="axis" />
            <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="axis" />
            <rect x={PAD.l} y={H - PAD.b + 10} width="28" height="18" className="axis-cap" />
            <text x={PAD.l + 14} y={H - PAD.b + 23} className="tick pixel-tick">低</text>
            <rect x={W - PAD.r - 28} y={H - PAD.b + 10} width="28" height="18" className="axis-cap" />
            <text x={W - PAD.r - 14} y={H - PAD.b + 23} className="tick pixel-tick">高</text>
            <text x={(PAD.l + W - PAD.r) / 2} y={H - 18} className="axis-label">X / {FEATURE_META[features[0]].label} →</text>
            <text x="22" y={(PAD.t + H - PAD.b) / 2} className="axis-label vertical">Y / {FEATURE_META[features[1]].label} →</text>
          </g>
        </svg>
      </div>

      <div className="plot-note pixel-scanner-readout">
        <span>&gt; CAT_GLYPH / BREAD_GLYPH = 训练样本</span>
        {revealUnknown && <span>? = 未参与训练的新样本</span>}
        {grid.length > 0 && <span>像素区域 = 当前模型判断空间</span>}
      </div>
    </section>
  )
}
