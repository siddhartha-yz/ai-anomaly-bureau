import { MODEL_META, type ModelId } from '../ml/registry'

type Props = {
  selected: ModelId
  unlocked: ModelId[]
  disabled?: boolean
  onChange: (model: ModelId) => void
}

export function ModelPicker({ selected, unlocked, disabled, onChange }: Props) {
  return (
    <section className="control-block" aria-labelledby="models-title">
      <div className="control-heading">
        <span className="control-number">02</span>
        <div>
          <h2 id="models-title">模型怎么判断</h2>
          <p>复杂度不是分数，只表示边界能拐多少弯。</p>
        </div>
      </div>
      <div className="model-list">
        {unlocked.map((id) => {
          const meta = MODEL_META[id]
          return (
            <button
              type="button"
              className={`model-card ${selected === id ? 'selected' : ''}`}
              key={id}
              disabled={disabled}
              onClick={() => onChange(id)}
              aria-pressed={selected === id}
            >
              <span className="model-card-top">
                <strong><span className="model-radio" />{meta.label}</strong>
                <span className="complexity">复杂度 {meta.complexityLabel}</span>
              </span>
              <span>{meta.description}</span>
              <span className="model-card-foot">{selected === id ? '已装载到分析终端' : '点击选择此模型'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
