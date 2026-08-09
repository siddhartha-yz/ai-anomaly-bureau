import { FEATURE_META } from '../ml/features'
import type { AuditResult } from '../game/types'
import type { DecisionCell, FeatureKey, Point2D, PublicSample, Sample } from '../ml/types'

const W = 760
const H = 520
const PAD = { l: 58, r: 24, t: 24, b: 54 }
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
}) {
  const resolution = grid.length ? Math.round(Math.sqrt(grid.length)) : 0
  const cellW = resolution ? (W - PAD.l - PAD.r) / resolution : 0
  const cellH = resolution ? (H - PAD.t - PAD.b) / resolution : 0
  const mistakeById = new Map(audit?.mistakes.map((mistake) => [mistake.id, mistake]))

  return (
    <section className="plot-card" aria-labelledby="plot-title">
      <div className="plot-heading">
        <div>
          <span className="plot-eyebrow">模型视野</span>
          <h2 id="plot-title">样本调查图</h2>
        </div>
        <div className="legend" aria-label="图例">
          <span><i className="legend-dot cat" /> 猫</span>
          <span><i className="legend-square bread" /> 面包</span>
          {revealUnknown && <span><i className="legend-diamond" /> 未知样本</span>}
        </div>
      </div>
      <div className="plot-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="训练样本、未知样本与模型决策边界散点图">
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M 44 0 L 0 0 0 44" className="grid-line" fill="none" />
            </pattern>
          </defs>
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="plot-bg" />
          {grid.map((cell) => (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={X(cell.x) - cellW / 2}
              y={Y(cell.y) - cellH / 2}
              width={cellW + 0.6}
              height={cellH + 0.6}
              className={`decision-cell ${cell.label}`}
            />
          ))}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="url(#grid)" />

          {train.map((point) =>
            point.label === 'cat' ? (
              <circle key={point.id} cx={X(point.x)} cy={Y(point.y)} r="6.5" className="train-point cat" />
            ) : (
              <rect key={point.id} x={X(point.x) - 6} y={Y(point.y) - 6} width="12" height="12" rx="2" className="train-point bread" />
            ),
          )}

          {revealUnknown && publicTest.map((sample) => {
            const point = unknownPoint(sample, features)
            const mistake = mistakeById.get(sample.id)
            const debugLabel = debugShowLabels ? debugTest?.find((item) => item.id === sample.id)?.label : undefined
            const label = mistake?.actual ?? debugLabel
            const selected = selectedMistake === sample.id
            return (
              <g key={sample.id} className={`test-point ${selected ? 'selected' : ''}`}>
                <rect
                  x={X(point.x) - 6}
                  y={Y(point.y) - 6}
                  width="12"
                  height="12"
                  transform={`rotate(45 ${X(point.x)} ${Y(point.y)})`}
                  className={label ? `known-test ${label}` : 'unknown-test'}
                />
                {mistake && (
                  <path d={`M ${X(point.x)-8} ${Y(point.y)-8} L ${X(point.x)+8} ${Y(point.y)+8} M ${X(point.x)+8} ${Y(point.y)-8} L ${X(point.x)-8} ${Y(point.y)+8}`} className="mistake-x" />
                )}
              </g>
            )
          })}

          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="axis" />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="axis" />
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 16} className="axis-label">{FEATURE_META[features[0]].label} →</text>
          <text x="18" y={(PAD.t + H - PAD.b) / 2} className="axis-label vertical">{FEATURE_META[features[1]].label} →</text>
          <text x={PAD.l} y={H - PAD.b + 22} className="tick">低</text>
          <text x={W - PAD.r - 16} y={H - PAD.b + 22} className="tick">高</text>
        </svg>
      </div>
      <div className="plot-note">
        <span>● / ■ = 训练样本</span>
        {revealUnknown && <span>◇ = 未参与训练的新样本</span>}
        {grid.length > 0 && <span>淡色区域 = 当前模型判断</span>}
      </div>
    </section>
  )
}
