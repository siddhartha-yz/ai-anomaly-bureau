import { useState } from 'react'
import { PERSONAS, type PersonaId, type RouteResult } from '../game/routes'
import type { GameState, Stage } from '../game/types'
import type { DecisionCell, Sample } from '../ml/types'

const STAGES: Stage[] = [
  'briefing', 'inspect_data', 'choose_features', 'choose_model', 'train', 'first_success',
  'hidden_test', 'inspect_errors', 'iterate', 'overfit_reveal', 'final_audit', 'transfer_question', 'complete',
]

export function DebugPanel({
  state,
  hiddenSamples,
  hiddenPredictions,
  grid,
  showLabels,
  onShowLabels,
  animationSpeed,
  onAnimationSpeed,
  onJump,
  onResetStage,
  onSeed,
  onRunPersona,
  onExport,
}: {
  state: GameState
  hiddenSamples: Sample[]
  hiddenPredictions: Array<{ id: string; actual: string; predicted: string }>
  grid: DecisionCell[]
  showLabels: boolean
  onShowLabels: (value: boolean) => void
  animationSpeed: number
  onAnimationSpeed: (value: number) => void
  onJump: (stage: Stage) => void
  onResetStage: () => void
  onSeed: (seed: number) => void
  onRunPersona: (persona: PersonaId) => RouteResult
  onExport: () => void
}) {
  const [seedDraft, setSeedDraft] = useState(String(state.seed))
  const [route, setRoute] = useState<RouteResult>()

  return (
    <aside className="debug-panel" aria-label="开发者测试模式">
      <div className="debug-title"><strong>DEBUG / TEST LAB</strong><span>?debug=1</span></div>
      <div className="debug-grid">
        <label>随机种子
          <span className="inline-field">
            <input value={seedDraft} onChange={(e) => setSeedDraft(e.target.value)} inputMode="numeric" />
            <button type="button" onClick={() => onSeed(Number(seedDraft) || 20260809)}>应用</button>
          </span>
        </label>
        <label>跳转阶段
          <select value={state.stage} onChange={(e) => onJump(e.target.value as Stage)}>
            {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
          </select>
        </label>
        <label>动画速度
          <select value={animationSpeed} onChange={(e) => onAnimationSpeed(Number(e.target.value))}>
            <option value={0}>关闭</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
          </select>
        </label>
        <label className="check-row"><input type="checkbox" checked={showLabels} onChange={(e) => onShowLabels(e.target.checked)} /> 显示隐藏测试真实标签</label>
      </div>
      <div className="debug-actions">
        <button type="button" onClick={onResetStage}>重置当前阶段</button>
        <button type="button" onClick={onExport}>导出行为日志 JSON</button>
      </div>
      <div className="debug-personas">
        <strong>自动路线</strong>
        <div>
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
            <button type="button" key={id} title={PERSONAS[id].description} onClick={() => setRoute(onRunPersona(id))}>{PERSONAS[id].label}</button>
          ))}
        </div>
        {route && <p>路线 {PERSONAS[route.persona].label}：{route.actions.length} 步 → {route.finalState.stage}，诊断 {route.finalState.diagnostics.length} 条。</p>}
      </div>
      <details>
        <summary>模型参数 / 状态诊断</summary>
        <pre>{JSON.stringify({ params: state.training?.params, diagnostics: state.diagnostics, attempts: state.attempts, retries: state.retryCount }, null, 2)}</pre>
      </details>
      <details>
        <summary>测试样本预测 / 真值（{hiddenSamples.length}）</summary>
        <pre>{JSON.stringify(hiddenSamples.map((sample) => ({
          id: sample.id,
          label: sample.label,
          predicted: hiddenPredictions.find((item) => item.id === sample.id)?.predicted ?? 'not-trained',
          features: sample.features,
        })), null, 2)}</pre>
      </details>
      <details>
        <summary>决策边界原始网格（{grid.length} cells）</summary>
        <pre>{JSON.stringify(grid, null, 2)}</pre>
      </details>
    </aside>
  )
}
