import { MODEL_META, type ModelId } from '../ml/registry'

type Props = {
  selected: ModelId
  unlocked: ModelId[]
  disabled?: boolean
  onChange: (model: ModelId) => void
}

function ModelPixelIcon({ id }: { id: ModelId }) {
  return (
    <svg viewBox="0 0 40 40" className={`model-pixel-icon model-icon-${id}`} aria-hidden="true">
      <g shapeRendering="crispEdges">
        <rect x="2" y="2" width="36" height="36" className="model-icon-screen" />
        {id === 'linear' && (
          <>
            <rect x="8" y="27" width="4" height="4" className="model-icon-cat" />
            <rect x="13" y="23" width="4" height="4" className="model-icon-cat" />
            <rect x="26" y="10" width="4" height="4" className="model-icon-bread" />
            <rect x="30" y="15" width="4" height="4" className="model-icon-bread" />
            <path d="M10 10 L30 30" className="model-icon-line" />
          </>
        )}
        {id === 'tree' && (
          <>
            <rect x="18" y="7" width="5" height="5" className="model-icon-node" />
            <rect x="9" y="26" width="5" height="5" className="model-icon-node" />
            <rect x="27" y="26" width="5" height="5" className="model-icon-node" />
            <path d="M20.5 12 V18 H11.5 V26 M20.5 18 H29.5 V26" className="model-icon-line" />
          </>
        )}
        {id === 'knn-1' && (
          <>
            <rect x="18" y="18" width="5" height="5" className="model-icon-focus" />
            <rect x="10" y="11" width="4" height="4" className="model-icon-cat" />
            <rect x="28" y="26" width="4" height="4" className="model-icon-bread" />
            <path d="M20 20 L13 13" className="model-icon-line" />
          </>
        )}
        {id === 'knn-5' && (
          <>
            <rect x="18" y="18" width="5" height="5" className="model-icon-focus" />
            <rect x="9" y="10" width="4" height="4" className="model-icon-cat" />
            <rect x="27" y="9" width="4" height="4" className="model-icon-cat" />
            <rect x="8" y="27" width="4" height="4" className="model-icon-bread" />
            <rect x="28" y="27" width="4" height="4" className="model-icon-bread" />
            <rect x="19" y="7" width="4" height="4" className="model-icon-cat" />
            <rect x="7" y="19" width="4" height="4" className="model-icon-bread" />
          </>
        )}
      </g>
    </svg>
  )
}

export function ModelPicker({ selected, unlocked, disabled, onChange }: Props) {
  return (
    <section className="control-block model-toolbox" aria-labelledby="models-title">
      <div className="control-heading">
        <span className="control-number">MODEL_TOOLBOX / 02</span>
        <div>
          <h2 id="models-title">装载判断工具</h2>
        </div>
      </div>
      <div className="model-list pixel-model-list">
        {unlocked.map((id) => {
          const meta = MODEL_META[id]
          return (
            <button
              type="button"
              className={`model-card pixel-model-card ${selected === id ? 'selected' : ''}`}
              key={id}
              disabled={disabled}
              onClick={() => onChange(id)}
              aria-pressed={selected === id}
            >
              <ModelPixelIcon id={id} />
              <span className="model-card-copy">
                <span className="model-card-top">
                  <strong>{meta.label}</strong>
                  <span className="complexity">复杂度 {meta.complexityLabel}</span>
                </span>
                <span className="model-card-foot">{selected === id ? '■ MODEL_LOADED' : '□ LOAD_MODEL'}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
