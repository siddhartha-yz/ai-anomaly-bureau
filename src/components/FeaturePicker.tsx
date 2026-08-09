import { useState } from 'react'
import { ALL_FEATURES, FEATURE_META } from '../ml/features'
import type { FeatureKey } from '../ml/types'

type Props = {
  value: [FeatureKey, FeatureKey]
  disabled?: boolean
  onChange: (features: [FeatureKey, FeatureKey]) => void
}

const ICON: Record<FeatureKey, string> = {
  warmth: '◒',
  roundness: '○',
  texture: '≋',
  aspect: '▭',
}

export function FeaturePicker({ value, disabled, onChange }: Props) {
  const [activeAxis, setActiveAxis] = useState<0 | 1>(0)

  const install = (feature: FeatureKey) => {
    if (disabled) return
    const otherAxis = activeAxis === 0 ? 1 : 0
    if (feature === value[activeAxis]) return
    if (feature === value[otherAxis]) {
      onChange([value[1], value[0]])
      setActiveAxis(otherAxis)
      return
    }
    const next: [FeatureKey, FeatureKey] = [...value]
    next[activeAxis] = feature
    onChange(next)
    setActiveAxis(otherAxis)
  }

  return (
    <section className="control-block pixel-control" aria-labelledby="features-title">
      <div className="control-heading">
        <span className="control-number">MODULE_01</span>
        <div>
          <h2 id="features-title">安装观察模块</h2>
          <p>模型一次只能通过两个通道观察样本。</p>
        </div>
      </div>

      <div className="feature-slots" aria-label="已安装特征">
        {([0, 1] as const).map((axis) => (
          <button
            type="button"
            className={`feature-slot ${activeAxis === axis ? 'active' : ''}`}
            key={axis}
            disabled={disabled}
            onClick={() => setActiveAxis(axis)}
          >
            <span className="slot-port">{axis === 0 ? 'X' : 'Y'}</span>
            <span className="slot-copy">
              <small>SCAN CHANNEL {axis + 1}</small>
              <strong>{ICON[value[axis]]} {FEATURE_META[value[axis]].label}</strong>
            </span>
            <span className="slot-status">{activeAxis === axis ? 'EDIT' : 'LOCK'}</span>
          </button>
        ))}
      </div>

      <div className="feature-inventory" aria-label="可用特征模块">
        {ALL_FEATURES.map((feature) => {
          const installedAt = value.indexOf(feature)
          const selected = installedAt >= 0
          return (
            <button
              type="button"
              className={`feature-chip ${selected ? 'installed' : ''}`}
              key={feature}
              disabled={disabled}
              onClick={() => install(feature)}
            >
              <span className="feature-icon">{ICON[feature]}</span>
              <span><strong>{FEATURE_META[feature].label}</strong><small>{FEATURE_META[feature].short}</small></span>
              <i>{selected ? `${installedAt === 0 ? 'X' : 'Y'}槽` : '装入'}</i>
            </button>
          )
        })}
      </div>

      <div className="feature-readout">
        <span>&gt; {FEATURE_META[value[activeAxis]].label}</span>
        <p>{FEATURE_META[value[activeAxis]].description}</p>
      </div>
    </section>
  )
}
