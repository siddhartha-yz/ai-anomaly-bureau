import { MODEL_META, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import type { EndlessCase } from './generator'
import type { EndlessFocus } from './EndlessNavigator'
import { experimentPlanDelta, type BandPrediction, type CausalPrediction, type EndlessRunRecord } from './uiTypes'

const FEATURES: FeatureKey[] = ['warmth', 'roundness', 'texture', 'aspect']
const MODELS: ModelId[] = ['linear', 'tree', 'knn-1', 'knn-5']

export function EndlessControls({
  caseData, features, activeSlot, model, trained, trainAccuracy, prediction, causalPrediction, credits, auditComplete,
  previousRun, focus, onActiveSlot, onFeature, onModel, onTrain, onPrediction, onCausalPrediction, onAudit, onEmergency,
}: {
  caseData: EndlessCase
  features: [FeatureKey, FeatureKey]
  activeSlot: 0 | 1
  model: ModelId
  trained: boolean
  trainAccuracy?: number
  prediction?: BandPrediction
  causalPrediction?: CausalPrediction
  credits: number
  auditComplete: boolean
  previousRun?: EndlessRunRecord
  focus?: EndlessFocus
  onActiveSlot: (slot: 0 | 1) => void
  onFeature: (feature: FeatureKey) => void
  onModel: (model: ModelId) => void
  onTrain: () => void
  onPrediction: (prediction: BandPrediction) => void
  onCausalPrediction: (prediction: CausalPrediction) => void
  onAudit: () => void
  onEmergency: () => void
}) {
  const planDelta = experimentPlanDelta(previousRun, model, features)
  const controlledPlan = planDelta === 'fields-only' || planDelta === 'model-only'
  const missingCausalPrediction = controlledPlan && !causalPrediction
  const plan = planDelta === 'repeat'
    ? { label: '复现实验', detail: '配置与上一条记录相同；可以检查稳定性，但不会增加新的配置证据。' }
    : planDelta === 'fields-only'
      ? { label: '只换字段', detail: '判断规则保持不变。本轮与上一条记录形成字段维度的单变量对照。' }
      : planDelta === 'model-only'
        ? { label: '只换模型', detail: '观察字段保持不变。本轮与上一条记录形成模型维度的单变量对照。' }
        : planDelta === 'mixed'
          ? { label: '字段 + 模型都换', detail: '本轮仍可执行，但两个因素同时变化，单条结果无法区分各自贡献。' }
          : undefined
  return (
    <div className={`endless-controls-stack ${focus === 'configure' ? 'configure-focus' : ''}`}>
      <section className="endless-control-panel sensor-deck">
        <div className="endless-panel-head"><span>01 / SENSOR DECK</span><strong>只装两个观察字段</strong></div>
        <div className="endless-feature-slots">
          {([0, 1] as const).map((slot) => (
            <button key={slot} type="button" className={activeSlot === slot ? 'active' : ''} onClick={() => onActiveSlot(slot)}>
              <i>{slot === 0 ? 'X' : 'Y'}</i><span>{caseData.featureNames[features[slot]]}</span>
            </button>
          ))}
        </div>
        <div className="endless-feature-list">
          {FEATURES.map((feature) => (
            <button key={feature} type="button" className={features.includes(feature) ? 'installed' : ''} onClick={() => onFeature(feature)}>
              <strong>{caseData.featureNames[feature]}</strong>
              <span className="sensor-evidence"><i>{features.includes(feature) ? '当前装载' : '候选字段'}</i></span>
            </button>
          ))}
        </div>
        <div className="sensor-evidence-help">
          正式值班不会预先替字段打分。切换字段后，左侧 <b>FIELD MATRIX</b> 会立即重画历史标签与无标签现场分布；先看结构，再决定哪一组值得花审计额度。
        </div>
      </section>

      <section className="endless-control-panel model-deck">
        <div className="endless-panel-head"><span>02 / MODEL DECK</span><strong>选择判断规则</strong></div>
        <div className="endless-model-list">
          {MODELS.map((id) => (
            <button key={id} type="button" className={model === id ? 'selected' : ''} onClick={() => onModel(id)}>
              <strong>{MODEL_META[id].label}</strong><small>{MODEL_META[id].nickname} · 复杂度 {MODEL_META[id].complexityLabel}</small>
            </button>
          ))}
        </div>
        {previousRun && plan && (
          <div className={`endless-plan-delta ${planDelta}`} aria-label="当前实验计划对照">
            <small>NEXT RUN vs E{String(previousRun.id).padStart(2, '0')}</small>
            <strong>{plan.label}</strong>
            <span>{plan.detail}</span>
          </div>
        )}
        <button type="button" className={`endless-primary ${focus === 'baseline' ? 'objective-action' : ''}`} onClick={onTrain}>训练当前方案</button>
      </section>

      {trained && !auditComplete && (
        <section className={`endless-control-panel experiment-console ${focus === 'predict' ? 'objective-focus' : ''}`}>
          <div className="endless-panel-head"><span>03 / PREDICT FIRST</span><strong>训练 {Math.round((trainAccuracy ?? 0) * 100)}%</strong></div>
          <p>在花掉一次未知审计前，先预测现场表现。</p>
          <div className="endless-band-picks">
            <button type="button" className={prediction === 'high' ? 'selected' : ''} onClick={() => onPrediction('high')}>≥85% 稳定</button>
            <button type="button" className={prediction === 'mid' ? 'selected' : ''} onClick={() => onPrediction('mid')}>60–84% 勉强</button>
            <button type="button" className={prediction === 'low' ? 'selected' : ''} onClick={() => onPrediction('low')}>&lt;60% 翻车</button>
          </div>
          {controlledPlan && (
            <div className="endless-causal-prediction" aria-label="因果预注册">
              <small>CAUSAL PRE-REGISTRATION</small>
              <strong>只改这一个变量，FIELD / 最低召回应该往哪个方向走？</strong>
              <div className="endless-causal-picks">
                <button type="button" className={causalPrediction === 'improved' ? 'selected' : ''} onClick={() => onCausalPrediction('improved')}>应该明显改善</button>
                <button type="button" className={causalPrediction === 'degraded' ? 'selected' : ''} onClick={() => onCausalPrediction('degraded')}>应该明显恶化</button>
                <button type="button" className={causalPrediction === 'null' ? 'selected' : ''} onClick={() => onCausalPrediction('null')}>应该基本不变</button>
              </div>
              <span>单变量正式审计必须先写下变化方向。审计后系统会封存“预期 / 实际”：猜错不会抹掉证据，但不能用“反正会变”回避真正的因果判断。</span>
            </div>
          )}
          <button type="button" className="endless-primary" disabled={!prediction || missingCausalPrediction || credits <= 0} onClick={onAudit}>{missingCausalPrediction ? '先完成因果预注册' : '消耗 1 次额度 · 运行现场审计'}</button>
          {credits <= 0 && <button type="button" className="endless-emergency" onClick={onEmergency}>申请额外审计（评级扣分）</button>}
        </section>
      )}
      {auditComplete && (
        <section className="endless-control-panel endless-round-complete">
          <div className="endless-panel-head"><span>03 / AUDIT COMPLETE</span><strong>本轮已封存</strong></div>
          <p>先读左侧结果与错误证据。下一次实验请修改观察字段或模型，再重新训练；也可以重训同一方案做复现。</p>
        </section>
      )}
    </div>
  )
}
