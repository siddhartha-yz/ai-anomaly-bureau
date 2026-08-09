import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AssistantPanel } from './components/AssistantPanel'
import { DebugPanel } from './components/DebugPanel'
import { ErrorSamples } from './components/ErrorSamples'
import { FeaturePicker } from './components/FeaturePicker'
import { Metrics } from './components/Metrics'
import { ModelPicker } from './components/ModelPicker'
import { ScatterPlot } from './components/ScatterPlot'
import { TaskBanner } from './components/TaskBanner'
import { LEVEL_META, TRANSFER_QUESTION, unlockedModels } from './content/level1'
import { createAuditService } from './game/audit'
import { BehaviorLogger } from './game/logging'
import { createInitialGameState, gameReducer } from './game/reducer'
import { runPersonaRoute, type PersonaId } from './game/routes'
import type { GameAction, Stage } from './game/types'
import { createDecisionGrid, evaluate } from './ml/evaluate'
import { projectSamples } from './ml/features'
import { MODEL_REGISTRY, type ModelId } from './ml/registry'
import type { FeatureKey } from './ml/types'

const STAGE_INDEX: Record<Stage, number> = {
  briefing: 0, inspect_data: 1, choose_features: 2, choose_model: 3, train: 4,
  first_success: 5, hidden_test: 6, inspect_errors: 7, iterate: 8,
  overfit_reveal: 9, final_audit: 10, transfer_question: 11, complete: 12,
}

function ActionButton({ children, onClick, disabled = false, kind = 'primary' }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  kind?: 'primary' | 'secondary'
}) {
  return (
    <button type="button" className={`action-button ${kind}`} onClick={onClick} disabled={disabled}>
      <span className="action-button-copy">
        <span className="action-chevron">›</span>
        {children}
      </span>
      <span className="action-button-cue">{kind === 'primary' ? '点击执行' : '点击检查'}</span>
    </button>
  )
}

function GameSession({ seed, debug, onSeedChange, onRestart }: {
  seed: number
  debug: boolean
  onSeedChange: (seed: number) => void
  onRestart: () => void
}) {
  const service = useMemo(() => createAuditService(seed), [seed])
  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState(seed, debug))
  const [selectedMistake, setSelectedMistake] = useState<string>()
  const [helpOpen, setHelpOpen] = useState(false)
  const [debugShowLabels, setDebugShowLabels] = useState(false)
  const [animationSpeed, setAnimationSpeed] = useState(1)
  const logger = useRef<BehaviorLogger>(new BehaviorLogger(seed))
  const completionLogged = useRef(false)

  const trainPoints = useMemo(
    () => projectSamples(service.train, state.selectedFeatures),
    [service, state.selectedFeatures],
  )
  const fitted = useMemo(() => {
    if (!state.training) return undefined
    return MODEL_REGISTRY[state.selectedModel].fit(trainPoints)
  }, [state.training, state.selectedModel, trainPoints])
  const grid = useMemo(() => fitted ? createDecisionGrid(fitted, 28) : [], [fitted])
  const revealUnknown = STAGE_INDEX[state.stage] >= STAGE_INDEX.hidden_test
  const debugSamples = debug ? service.debugTest() : []
  const debugPredictions = debug && fitted
    ? projectSamples(debugSamples, state.selectedFeatures).map((point) => ({
        id: point.id,
        actual: point.label,
        predicted: fitted.predict(point),
      }))
    : []

  useEffect(() => {
    if (state.stage === 'complete' && !completionLogged.current) {
      completionLogged.current = true
      logger.current.record({
        stage: 'complete', action: 'COMPLETE', features: [...state.selectedFeatures], model: state.selectedModel,
        trainAccuracy: state.training?.accuracy, testAccuracy: state.audit?.accuracy,
        retryCount: state.retryCount, completed: true,
      })
    }
  }, [state])

  const record = (action: string, extra: Partial<Parameters<BehaviorLogger['record']>[0]> = {}) => {
    logger.current.record({
      stage: state.stage,
      action,
      features: [...state.selectedFeatures],
      model: state.selectedModel,
      trainAccuracy: state.training?.accuracy,
      testAccuracy: state.audit?.accuracy,
      retryCount: state.retryCount,
      completed: state.stage === 'complete',
      ...extra,
    })
  }

  const send = (action: GameAction, eventName: string = action.type) => {
    record(eventName)
    dispatch(action)
  }

  const setFeatures = (features: [FeatureKey, FeatureKey]) => {
    setSelectedMistake(undefined)
    record('SELECT_FEATURES', { features })
    dispatch({ type: 'SET_FEATURES', features })
  }

  const setModel = (model: ModelId) => {
    setSelectedMistake(undefined)
    record('SELECT_MODEL', { model })
    dispatch({ type: 'SET_MODEL', model })
  }

  const train = () => {
    const classifier = MODEL_REGISTRY[state.selectedModel]
    const model = classifier.fit(trainPoints)
    const metrics = evaluate(model, trainPoints)
    record('TRAIN', { trainAccuracy: metrics.accuracy })
    dispatch({
      type: 'TRAIN_RESULT',
      result: {
        accuracy: metrics.accuracy,
        errorCount: metrics.errorCount,
        complexity: model.complexity,
        params: debug ? model.describe() : undefined,
      },
    })
  }

  const audit = () => {
    const model = fitted ?? MODEL_REGISTRY[state.selectedModel].fit(trainPoints)
    const result = service.audit(model, state.selectedFeatures)
    record('RUN_AUDIT', { testAccuracy: result.accuracy })
    dispatch({ type: 'AUDIT_RESULT', result })
    setSelectedMistake(result.mistakes[0]?.id)
  }

  const viewMistake = (id: string) => {
    setSelectedMistake(id)
    record('VIEW_MISTAKE', { mistakeId: id })
    dispatch({ type: 'VIEW_MISTAKE', id })
  }

  const requestHint = () => {
    const next = Math.min(3, state.hintLevel + 1) as 1 | 2 | 3
    record('REQUEST_HINT', { hintLevel: next })
    dispatch({ type: 'REQUEST_HINT' })
  }

  const exportLog = () => {
    record('EXPORT_LOG')
    const payload = JSON.stringify(logger.current.snapshot(), null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ai-anomaly-${new Date().toISOString().replace(/[:.]/g, '-')}.behavior-log.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const availableModels: ModelId[] = debug
    ? ['linear', 'tree', 'knn-1', 'knn-5']
    : STAGE_INDEX[state.stage] >= STAGE_INDEX.iterate
      ? unlockedModels(state.hasSeenOverfit)
      : ['linear']

  const controlsVisible = STAGE_INDEX[state.stage] >= STAGE_INDEX.choose_features && !['final_audit', 'transfer_question', 'complete'].includes(state.stage)
  const featureDisabled = ['briefing', 'inspect_data', 'choose_model', 'train', 'first_success', 'hidden_test', 'inspect_errors', 'overfit_reveal', 'final_audit', 'transfer_question'].includes(state.stage)
  const modelDisabled = ['briefing', 'inspect_data', 'choose_features', 'train', 'first_success', 'hidden_test', 'inspect_errors', 'overfit_reveal', 'final_audit', 'transfer_question'].includes(state.stage)

  const stageAction = () => {
    switch (state.stage) {
      case 'briefing': return <ActionButton onClick={() => send({ type: 'START' })}>接受事故调查</ActionButton>
      case 'inspect_data': return <ActionButton onClick={() => send({ type: 'OBSERVE_DONE' })}>我找到了一些规律</ActionButton>
      case 'choose_features': return <ActionButton onClick={() => send({ type: 'ADVANCE' })}>让模型看这两项</ActionButton>
      case 'choose_model': return <ActionButton onClick={() => send({ type: 'ADVANCE' })}>使用这个模型</ActionButton>
      case 'train': return <ActionButton onClick={train}>训练模型并画出边界</ActionButton>
      case 'first_success': return <ActionButton onClick={() => send({ type: 'ADVANCE' })}>接受未知样本挑战</ActionButton>
      case 'hidden_test': return <ActionButton onClick={audit}>运行未知样本审计</ActionButton>
      case 'inspect_errors': return <ActionButton disabled={state.viewedMistakes.length === 0} onClick={() => send({ type: 'ADVANCE' })}>{state.viewedMistakes.length ? '带着线索开始修复' : '先查看一个误判'}</ActionButton>
      case 'iterate': return (
        <div className="dual-actions">
          <ActionButton onClick={train}>训练当前方案</ActionButton>
          <ActionButton kind="secondary" disabled={!state.training} onClick={audit}>用未知数据审计</ActionButton>
        </div>
      )
      case 'overfit_reveal': return <ActionButton onClick={() => send({ type: 'ADVANCE' })}>我看到了，重新设计</ActionButton>
      case 'final_audit': return <ActionButton onClick={() => send({ type: 'ADVANCE' })}>进入最后一问</ActionButton>
      default: return null
    }
  }

  const motionDuration = animationSpeed === 0 ? 0 : Math.round(260 / animationSpeed)

  return (
    <main className="app-shell" style={{ '--motion-duration': `${motionDuration}ms` } as React.CSSProperties}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">A/Δ</span><div><strong>AI异常调查局</strong><small>ANOMALY BUREAU · CASE 001</small></div></div>
        <div className="case-status" aria-label="案件状态">
          <span className="status-light" />
          <div><small>CASE STATUS</small><strong>{state.stage === 'complete' ? 'CLOSED' : 'ACTIVE'}</strong></div>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost-button" onClick={() => setHelpOpen((open) => !open)}>帮助</button>
          <button type="button" className="ghost-button" onClick={onRestart}>重新开始</button>
          {debug && <span className="debug-badge">DEBUG</span>}
        </div>
      </header>

      {helpOpen && (
        <section className="help-strip">
          <strong>怎么玩：</strong> 看图 → 选两项特征 → 选模型 → 训练 → 用未知样本审计。失败时点开误判，再修改方案。
        </section>
      )}

      <TaskBanner stage={state.stage} />

      {state.stage === 'briefing' && (
        <section className="incident-card case-dossier">
          <div className="dossier-copy">
            <div className="incident-code">INCIDENT / C-014 · PRIORITY AMBER</div>
            <h1>{LEVEL_META.incident}</h1>
            <p>校园识别终端正在持续产生错误报告。你的任务不是背公式，而是找出它为什么会判断错。</p>
            <div className="briefing-tags">
              <span>地点 / 校园北门</span>
              <span>系统 / STRAY-VISION 2.1</span>
              <span>权限 / 新人调查员</span>
            </div>
          </div>
          <div className="incident-monitor" aria-label="错误识别示意">
            <div className="monitor-label">LIVE ERROR CAPTURE</div>
            <div className="scan-target cat-target">
              <span className="target-reticle" />
              <span className="target-glyph">CAT</span>
            </div>
            <div className="classification-line"><span>MODEL OUTPUT</span><strong>→ BREAD</strong></div>
            <div className="confidence-bar"><span style={{ width: '87%' }} /></div>
            <small>CONFIDENCE 87% · WRONG CLASSIFICATION</small>
          </div>
        </section>
      )}

      <div className="workspace">
        <div className="visual-column">
          <ScatterPlot
            train={trainPoints}
            publicTest={service.publicTest}
            debugTest={debugSamples}
            features={state.selectedFeatures}
            grid={grid}
            audit={state.audit}
            revealUnknown={revealUnknown}
            debugShowLabels={debugShowLabels}
            selectedMistake={selectedMistake}
          />
          <Metrics training={state.training} audit={state.audit} model={state.selectedModel} />
          <ErrorSamples
            audit={state.audit}
            selectedFeatures={state.selectedFeatures}
            viewed={state.viewedMistakes}
            selectedId={selectedMistake}
            onSelect={viewMistake}
          />
        </div>

        <div className="control-column">
          {controlsVisible && (
            <>
              <FeaturePicker value={state.selectedFeatures} disabled={featureDisabled && !debug} onChange={setFeatures} />
              {STAGE_INDEX[state.stage] >= STAGE_INDEX.choose_model && (
                <ModelPicker selected={state.selectedModel} unlocked={availableModels} disabled={modelDisabled && !debug} onChange={setModel} />
              )}
            </>
          )}

          {state.stage === 'overfit_reveal' && state.training && state.audit && (
            <section className="concept-card">
              <span>现象命名</span>
              <h2>过拟合 / Overfitting</h2>
              <p>训练 {Math.round(state.training.accuracy * 100)}%，未知数据 {Math.round(state.audit.accuracy * 100)}%。模型把训练中的噪声也当成了规律。</p>
            </section>
          )}

          {state.stage === 'final_audit' && (
            <section className="concept-card success-card">
              <span>修复标准通过</span>
              <h2>不是训练满分，而是新样本也站得住。</h2>
              <p>这就是你刚亲手验证的“泛化”：规则能否应对没见过的数据。</p>
            </section>
          )}

          {state.stage === 'transfer_question' && (
            <section className="transfer-card">
              <span>迁移问题</span>
              <h2>{TRANSFER_QUESTION.prompt}</h2>
              <div className="transfer-options">
                {TRANSFER_QUESTION.options.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={state.transferAnswer === option.id ? 'selected' : ''}
                    onClick={() => {
                      record('ANSWER_TRANSFER')
                      dispatch({ type: 'ANSWER_TRANSFER', id: option.id, correct: option.correct })
                    }}
                  >{option.label}</button>
                ))}
              </div>
              {state.transferAnswer && <p className="answer-note">{TRANSFER_QUESTION.explanation}</p>}
              <ActionButton disabled={!state.transferAnswer} onClick={() => send({ type: 'ADVANCE' })}>提交调查报告</ActionButton>
            </section>
          )}

          {state.stage === 'complete' && (
            <section className="completion-card">
              <span className="completion-stamp">CASE CLOSED</span>
              <h1>你修好的不是一个分数。</h1>
              <p>你让模型从“会做旧题”变成了“能面对新样本”。</p>
              <div className="takeaways">
                <span>数据决定它见过什么</span><span>特征决定它能看什么</span><span>测试集检查未知世界</span><span>错误样本帮助找原因</span>
              </div>
              <ActionButton onClick={onRestart}>重新调查一次</ActionButton>
            </section>
          )}

          {stageAction() && (
            <section className="action-dock">
              <div className="action-dock-head">
                <div><span className="dock-pulse" />NEXT ACTION</div>
                <small>推进调查</small>
              </div>
              {stageAction()}
              <p>所有关键操作都会立即反映在左侧数据图上。</p>
            </section>
          )}
          <AssistantPanel state={state} onHint={requestHint} />
        </div>
      </div>

      {debug && (
        <DebugPanel
          state={state}
          hiddenSamples={debugSamples}
          hiddenPredictions={debugPredictions}
          grid={grid}
          showLabels={debugShowLabels}
          onShowLabels={setDebugShowLabels}
          animationSpeed={animationSpeed}
          onAnimationSpeed={setAnimationSpeed}
          onJump={(stage) => send({ type: 'DEBUG_JUMP', stage }, `DEBUG_JUMP:${stage}`)}
          onResetStage={() => send({ type: 'DEBUG_RESET_STAGE' })}
          onSeed={onSeedChange}
          onRunPersona={(persona: PersonaId) => {
            record(`AUTO_ROUTE:${persona}`)
            const result = runPersonaRoute(persona, seed)
            dispatch({ type: 'DEBUG_LOAD_STATE', state: result.finalState })
            return result
          }}
          onExport={exportLog}
        />
      )}
    </main>
  )
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const debug = params.get('debug') === '1'
  const initialSeed = Number(params.get('seed')) || 20260809
  const [seed, setSeed] = useState(initialSeed)
  const [session, setSession] = useState(0)

  const changeSeed = (nextSeed: number) => {
    setSeed(nextSeed)
    setSession((value) => value + 1)
  }

  return <GameSession key={`${seed}-${session}`} seed={seed} debug={debug} onSeedChange={changeSeed} onRestart={() => setSession((value) => value + 1)} />
}
