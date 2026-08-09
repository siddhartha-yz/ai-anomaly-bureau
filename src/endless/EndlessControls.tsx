import { MODEL_META, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import type { EndlessCase } from './generator'
import { featureObservation } from './observables'
import type { BandPrediction } from './uiTypes'

const FEATURES: FeatureKey[] = ['warmth', 'roundness', 'texture', 'aspect']
const MODELS: ModelId[] = ['linear', 'tree', 'knn-1', 'knn-5']

export function EndlessControls({
  caseData, features, activeSlot, model, trained, trainAccuracy, prediction, credits, auditComplete,
  onActiveSlot, onFeature, onModel, onTrain, onPrediction, onAudit, onEmergency,
}: {
  caseData: EndlessCase
  features: [FeatureKey, FeatureKey]
  activeSlot: 0 | 1
  model: ModelId
  trained: boolean
  trainAccuracy?: number
  prediction?: BandPrediction
  credits: number
  auditComplete: boolean
  onActiveSlot: (slot: 0 | 1) => void
  onFeature: (feature: FeatureKey) => void
  onModel: (model: ModelId) => void
  onTrain: () => void
  onPrediction: (prediction: BandPrediction) => void
  onAudit: () => void
  onEmergency: () => void
}) {
  return (
    <>
      <section className="endless-control-panel">
        <div className="endless-panel-head"><span>01 / SENSOR DECK</span><strong>只装两个观察字段</strong></div>
        <div className="endless-feature-slots">
          {([0, 1] as const).map((slot) => (
            <button key={slot} type="button" className={activeSlot === slot ? 'active' : ''} onClick={() => onActiveSlot(slot)}>
              <i>{slot === 0 ? 'X' : 'Y'}</i><span>{caseData.featureNames[features[slot]]}</span>
            </button>
          ))}
        </div>
        <div className="endless-feature-list">
          {FEATURES.map((feature) => {
            const observed = featureObservation(caseData, feature)
            return (
              <button key={feature} type="button" className={features.includes(feature) ? 'installed' : ''} onClick={() => onFeature(feature)}>
                <strong>{caseData.featureNames[feature]}</strong>
                <small>{caseData.featureHints[feature]}</small>
                <span className="sensor-evidence"><i>旧差异 {observed.separationLevel}/5</i><i>现场变化 {observed.driftLevel}/5</i></span>
              </button>
            )
          })}
        </div>
        <div className="sensor-evidence-help">读数说明：<b>旧差异</b>只看历史标签分得多开；<b>现场变化</b>不看现场答案，只比较无标签分布有没有变。</div>
      </section>

      <section className="endless-control-panel">
        <div className="endless-panel-head"><span>02 / MODEL DECK</span><strong>选择判断规则</strong></div>
        <div className="endless-model-list">
          {MODELS.map((id) => (
            <button key={id} type="button" className={model === id ? 'selected' : ''} onClick={() => onModel(id)}>
              <strong>{MODEL_META[id].label}</strong><small>{MODEL_META[id].nickname} · 复杂度 {MODEL_META[id].complexityLabel}</small>
            </button>
          ))}
        </div>
        <button type="button" className="endless-primary" onClick={onTrain}>训练当前方案</button>
      </section>

      {trained && !auditComplete && (
        <section className="endless-control-panel experiment-console">
          <div className="endless-panel-head"><span>03 / PREDICT FIRST</span><strong>训练 {Math.round((trainAccuracy ?? 0) * 100)}%</strong></div>
          <p>在花掉一次未知审计前，先预测现场表现。</p>
          <div className="endless-band-picks">
            <button type="button" className={prediction === 'high' ? 'selected' : ''} onClick={() => onPrediction('high')}>≥85% 稳定</button>
            <button type="button" className={prediction === 'mid' ? 'selected' : ''} onClick={() => onPrediction('mid')}>60–84% 勉强</button>
            <button type="button" className={prediction === 'low' ? 'selected' : ''} onClick={() => onPrediction('low')}>&lt;60% 翻车</button>
          </div>
          <button type="button" className="endless-primary" disabled={!prediction || credits <= 0} onClick={onAudit}>消耗 1 次额度 · 运行现场审计</button>
          {credits <= 0 && <button type="button" className="endless-emergency" onClick={onEmergency}>申请额外审计（评级扣分）</button>}
        </section>
      )}
      {auditComplete && (
        <section className="endless-control-panel endless-round-complete">
          <div className="endless-panel-head"><span>03 / AUDIT COMPLETE</span><strong>本轮已封存</strong></div>
          <p>先读左侧结果与错误证据。下一次实验请修改观察字段或模型，再重新训练；也可以重训同一方案做复现。</p>
        </section>
      )}
    </>
  )
}
