import { ALL_FEATURES, FEATURE_META } from '../ml/features'
import type { FeatureKey } from '../ml/types'

type Props = {
  value: [FeatureKey, FeatureKey]
  disabled?: boolean
  onChange: (features: [FeatureKey, FeatureKey]) => void
}

export function FeaturePicker({ value, disabled, onChange }: Props) {
  const setAxis = (axis: 0 | 1, feature: FeatureKey) => {
    if (feature === value[1 - axis]) return
    const next: [FeatureKey, FeatureKey] = [...value]
    next[axis] = feature
    onChange(next)
  }

  return (
    <section className="control-block" aria-labelledby="features-title">
      <div className="control-heading">
        <span className="control-number">01</span>
        <div>
          <h2 id="features-title">模型能看见什么</h2>
          <p>两项信息会成为图上的横轴和纵轴。</p>
        </div>
      </div>
      <div className="axis-selectors">
        {([0, 1] as const).map((axis) => (
          <label className="axis-channel" key={axis}>
            <span className="axis-channel-head">
              <strong>{axis === 0 ? 'X' : 'Y'}</strong>
              <span>{axis === 0 ? '横轴扫描通道' : '纵轴扫描通道'}</span>
            </span>
            <select
              value={value[axis]}
              disabled={disabled}
              onChange={(event) => setAxis(axis, event.target.value as FeatureKey)}
            >
              {ALL_FEATURES.map((feature) => (
                <option key={feature} value={feature} disabled={feature === value[1 - axis]}>
                  {FEATURE_META[feature].label}
                </option>
              ))}
            </select>
            <span className="selector-hint">点击切换模型可见信息 ▾</span>
          </label>
        ))}
      </div>
      <p className="microcopy">{FEATURE_META[value[0]].description}</p>
      <p className="microcopy">{FEATURE_META[value[1]].description}</p>
    </section>
  )
}
