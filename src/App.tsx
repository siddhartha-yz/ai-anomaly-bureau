import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AssistantPanel } from './components/AssistantPanel'
import { BeginnerGuide } from './components/BeginnerGuide'
import { DebugPanel } from './components/DebugPanel'
import { EntryExperience, type EntryPhase } from './components/EntryExperience'
import { ErrorSamples } from './components/ErrorSamples'
import { FeaturePicker } from './components/FeaturePicker'
import { Metrics } from './components/Metrics'
import { ModelPicker } from './components/ModelPicker'
import { IncidentScene } from './components/PixelScene'
import { ScatterPlot } from './components/ScatterPlot'
import { StageReward, type RewardNotice } from './components/StageReward'
import { TaskBanner } from './components/TaskBanner'
import { TRANSFER_QUESTION, unlockedModels } from './content/level1'
import { GameAudio } from './game/audio'
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

const STAGE_REWARD: Partial<Record<Stage, Omit<RewardNotice, 'stage'>>> = {
  inspect_data: { title: '案件已接手', detail: '事故现场已解锁', tone: 'blue' },
  choose_features: { title: '观察完成', detail: '获得线索：样本分布', tone: 'blue' },
  choose_model: { title: '传感器已配置', detail: '模型现在有了两个观察通道', tone: 'blue' },
  train: { title: '工具已装载', detail: '可以开始第一次训练', tone: 'blue' },
  first_success: { title: '第一次训练完成', detail: '旧样本检查通过', tone: 'yellow' },
  hidden_test: { title: '现场抽查解锁', detail: '未知样本即将进入', tone: 'yellow' },
  inspect_errors: { title: '发现异常证据', detail: '误判样本已标记', tone: 'yellow' },
  iterate: { title: '修复权限开放', detail: '可以重新组合特征与模型', tone: 'blue' },
  overfit_reveal: { title: '关键发现：过拟合', detail: '训练满分也可能是假象', tone: 'yellow' },
  final_audit: { title: '修复验证通过', detail: '未知样本表现稳定', tone: 'yellow' },
  transfer_question: { title: '结案权限解锁', detail: '只剩最后一个判断', tone: 'blue' },
  complete: { title: 'CASE CLOSED', detail: '事故调查完成', tone: 'yellow' },
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
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [entryPhase, setEntryPhase] = useState<EntryPhase>(debug ? 'game' : 'title')
  const [rewardNotice, setRewardNotice] = useState<RewardNotice>()
  const logger = useRef<BehaviorLogger>(new BehaviorLogger(seed))
  const completionLogged = useRef(false)
  const audio = useRef(new GameAudio(true))
  const previousStage = useRef<Stage>('briefing')

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

  useEffect(() => {
    const from = previousStage.current
    if (from === state.stage) return
    previousStage.current = state.stage
    const reward = STAGE_REWARD[state.stage]
    if (!reward) return
    setRewardNotice({ stage: state.stage, ...reward })
    const rewardSound = state.stage === 'inspect_errors' || state.stage === 'overfit_reveal'
      ? 'warning'
      : reward.tone === 'yellow' ? 'success' : 'select'
    audio.current.play(rewardSound)
    const timer = window.setTimeout(() => setRewardNotice(undefined), 2100)
    return () => window.clearTimeout(timer)
  }, [state.stage])

  useEffect(() => () => audio.current.dispose(), [])

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
    audio.current.play('ui')
    record(eventName)
    dispatch(action)
  }

  const setFeatures = (features: [FeatureKey, FeatureKey]) => {
    audio.current.play('select')
    setSelectedMistake(undefined)
    record('SELECT_FEATURES', { features })
    dispatch({ type: 'SET_FEATURES', features })
  }

  const setModel = (model: ModelId) => {
    audio.current.play('select')
    setSelectedMistake(undefined)
    record('SELECT_MODEL', { model })
    dispatch({ type: 'SET_MODEL', model })
  }

  const train = () => {
    audio.current.play('train')
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
    audio.current.play('audit')
    const model = fitted ?? MODEL_REGISTRY[state.selectedModel].fit(trainPoints)
    const result = service.audit(model, state.selectedFeatures)
    record('RUN_AUDIT', { testAccuracy: result.accuracy })
    dispatch({ type: 'AUDIT_RESULT', result })
    setSelectedMistake(result.mistakes[0]?.id)
  }

  const viewMistake = (id: string) => {
    audio.current.play('evidence')
    setSelectedMistake(id)
    record('VIEW_MISTAKE', { mistakeId: id })
    dispatch({ type: 'VIEW_MISTAKE', id })
  }

  const requestHint = () => {
    audio.current.play('hint')
    const next = Math.min(3, state.hintLevel + 1) as 1 | 2 | 3
    record('REQUEST_HINT', { hintLevel: next })
    dispatch({ type: 'REQUEST_HINT' })
  }

  const toggleAudio = () => {
    const next = !audioEnabled
    setAudioEnabled(next)
    audio.current.setEnabled(next)
  }

  const startEntry = () => {
    void audio.current.ensureStarted()
    audio.current.play('select')
    record('ENTRY_START')
    setEntryPhase('boot')
  }

  const completeEntry = () => {
    send({ type: 'START' }, 'ENTER_WORKSPACE')
    setEntryPhase('game')
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
  const currentAction = stageAction()
  const isBriefing = state.stage === 'briefing'
  const showMetrics = Boolean(state.training) || STAGE_INDEX[state.stage] >= STAGE_INDEX.first_success

  if (!debug && entryPhase !== 'game') {
    return (
      <EntryExperience
        phase={entryPhase}
        onStart={startEntry}
        onComplete={completeEntry}
        audioEnabled={audioEnabled}
      />
    )
  }

  return (
    <main className="app-shell" data-stage={state.stage} style={{ '--motion-duration': `${motionDuration}ms` } as React.CSSProperties}>
      <header className="pixel-game-header">
        <div className="game-logo-block" aria-label="AI异常调查局">
          <span className="game-logo-pixel">A<span>/</span>Δ</span>
          <div className="game-title-copy">
            <strong>AI异常调查局</strong>
            <small>ANOMALY BUREAU</small>
          </div>
        </div>
        <div className="case-cartridge">
          <span className="case-cartridge-index">CASE 001</span>
          <span className="case-cartridge-title">失控的分类器</span>
          <span className={`case-cartridge-state ${state.stage === 'complete' ? 'closed' : ''}`}>
            {state.stage === 'complete' ? 'CLOSED' : 'IN PROGRESS'}
          </span>
        </div>
        <div className="game-header-actions">
          <button type="button" className={`pixel-icon-button audio-toggle ${audioEnabled ? 'enabled' : ''}`} onClick={toggleAudio} aria-label={audioEnabled ? '关闭声音' : '开启声音'}>
            <span>{audioEnabled ? '♪' : '×'}</span><small>{audioEnabled ? 'AUDIO' : 'MUTE'}</small>
          </button>
          <button type="button" className="pixel-icon-button" onClick={() => setHelpOpen((open) => !open)} aria-label="帮助">
            <span>?</span><small>HELP</small>
          </button>
          <button type="button" className="pixel-icon-button" onClick={() => { audio.current.play('ui'); onRestart() }} aria-label="重新开始">
            <span>↻</span><small>RESET</small>
          </button>
          {debug && <span className="debug-badge">DEBUG</span>}
        </div>
      </header>

      {helpOpen && (
        <section className="help-strip">
          <strong>怎么玩：</strong> 看图 → 选两项特征 → 选模型 → 训练 → 用未知样本审计。失败时点开误判，再修改方案。
        </section>
      )}

      <TaskBanner stage={state.stage} />
      <StageReward notice={rewardNotice} />

      {isBriefing ? (
        <div className="briefing-game-layout">
          {!debug && <BeginnerGuide stage={state.stage} />}
          <IncidentScene />
          <div className="briefing-bottom-row">
            <AssistantPanel state={state} onHint={requestHint} />
            {currentAction && <section className="pixel-command-dock">{currentAction}</section>}
          </div>
        </div>
      ) : (
        <div className="workspace game-workspace">
          <div className="visual-column game-stage-column">
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
              onSelectMistake={viewMistake}
            />
            {showMetrics && <Metrics training={state.training} audit={state.audit} model={state.selectedModel} />}
            <ErrorSamples
              audit={state.audit}
              selectedFeatures={state.selectedFeatures}
              viewed={state.viewedMistakes}
              selectedId={selectedMistake}
              onSelect={viewMistake}
            />
          </div>

          <div className="control-column game-console-column">
            {!debug && <BeginnerGuide stage={state.stage} compact />}
            {controlsVisible && (
              <>
                <FeaturePicker value={state.selectedFeatures} disabled={featureDisabled && !debug} onChange={setFeatures} />
                {STAGE_INDEX[state.stage] >= STAGE_INDEX.choose_model && (
                  <ModelPicker selected={state.selectedModel} unlocked={availableModels} disabled={modelDisabled && !debug} onChange={setModel} />
                )}
              </>
            )}

            {state.stage === 'overfit_reveal' && state.training && state.audit && (
              <section className="concept-card pixel-result-card warning-result">
                <span>FOUND / PATTERN_FAILURE</span>
                <h2>过拟合 / Overfitting</h2>
                <p>训练 {Math.round(state.training.accuracy * 100)}%，未知数据 {Math.round(state.audit.accuracy * 100)}%。模型把训练中的噪声也当成了规律。</p>
              </section>
            )}

            {state.stage === 'final_audit' && (
              <section className="concept-card success-card pixel-result-card">
                <span>PATCH / VERIFIED</span>
                <h2>不是训练满分，而是新样本也站得住。</h2>
                <p>这就是你刚亲手验证的“泛化”：规则能否应对没见过的数据。</p>
              </section>
            )}

            {state.stage === 'transfer_question' && (
              <section className="transfer-card pixel-result-card">
                <span>FINAL_CHECK.EXE</span>
                <h2>{TRANSFER_QUESTION.prompt}</h2>
                <div className="transfer-options">
                  {TRANSFER_QUESTION.options.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={state.transferAnswer === option.id ? 'selected' : ''}
                      onClick={() => {
                        audio.current.play('select')
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
              <section className="completion-card pixel-result-card">
                <span className="completion-stamp">CASE CLOSED</span>
                <h1>你修好的不是一个分数。</h1>
                <p>你让模型从“会做旧题”变成了“能面对新样本”。</p>
                <div className="takeaways">
                  <span>数据决定它见过什么</span><span>特征决定它能看什么</span><span>测试集检查未知世界</span><span>错误样本帮助找原因</span>
                </div>
                <ActionButton onClick={onRestart}>重新调查一次</ActionButton>
              </section>
            )}

            {currentAction && <section className="pixel-command-dock">{currentAction}</section>}
            <AssistantPanel state={state} onHint={requestHint} />
          </div>
        </div>
      )}

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
