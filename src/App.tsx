import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AssistantPanel } from './components/AssistantPanel'
import { BeginnerGuide } from './components/BeginnerGuide'
import { CaseAttempts, type ExperimentRecord } from './components/CaseAttempts'
import { DebugPanel } from './components/DebugPanel'
import { EntryExperience, type EntryPhase } from './components/EntryExperience'
import { ErrorSamples } from './components/ErrorSamples'
import { FeaturePicker } from './components/FeaturePicker'
import { GuideConnector } from './components/GuideConnector'
import { InvestigationPrompt } from './components/InvestigationPrompt'
import { Metrics } from './components/Metrics'
import { ModelPicker } from './components/ModelPicker'
import { PhaseTransition, type PhaseTransitionCue } from './components/PhaseTransition'
import { IncidentScene } from './components/PixelScene'
import { ScatterPlot } from './components/ScatterPlot'
import { SensorIntro } from './components/SensorIntro'
import { StageReward, type RewardNotice } from './components/StageReward'
import { TaskBanner } from './components/TaskBanner'
import { TRANSFER_QUESTION, unlockedModels } from './content/level1'
import { GameAudio, type GameMusicPhase } from './game/audio'
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

const musicPhaseFor = (stage: Stage): GameMusicPhase => {
  const index = STAGE_INDEX[stage]
  if (index < STAGE_INDEX.hidden_test) return 1
  if (index < STAGE_INDEX.iterate) return 2
  if (index < STAGE_INDEX.transfer_question) return 3
  return 4
}

const PHASE_TRANSITION: Partial<Record<Stage, PhaseTransitionCue>> = {
  hidden_test: {
    phase: 2,
    code: 'UNKNOWN_AUDIT / LINK',
    title: '未知审计已接入',
    detail: '接下来进入一批从未参与训练的新样本。',
    tone: 'yellow',
  },
  iterate: {
    phase: 3,
    code: 'REPAIR_CONSOLE / UNLOCK',
    title: '系统修复权限开放',
    detail: '现在可以重新组合观察方式与判断工具。',
    tone: 'blue',
  },
  transfer_question: {
    phase: 4,
    code: 'CASE_REVIEW / FINAL',
    title: '进入结案复盘',
    detail: '最后验证你是否抓住了真正的问题。',
    tone: 'yellow',
  },
}

const STAGE_REWARD: Partial<Record<Stage, Omit<RewardNotice, 'stage'>>> = {
  choose_features: { title: '观察完成', detail: '获得线索：样本分布', tone: 'blue' },
  choose_model: { title: '传感器已配置', detail: '模型现在有了两个观察通道', tone: 'blue' },
  train: { title: '工具已装载', detail: '可以开始第一次训练', tone: 'blue' },
  first_success: { title: '第一次训练完成', detail: '旧样本检查通过', tone: 'yellow', important: true },
  hidden_test: { title: '现场抽查解锁', detail: '未知样本即将进入', tone: 'yellow' },
  inspect_errors: { title: '发现异常证据', detail: '误判样本已标记', tone: 'yellow' },
  iterate: { title: '修复权限开放', detail: '可以重新组合特征与模型', tone: 'blue' },
  overfit_reveal: { title: '关键发现：过拟合', detail: '训练满分也可能是假象', tone: 'yellow', important: true },
  final_audit: { title: '修复验证通过', detail: '未知样本表现稳定', tone: 'yellow', important: true },
  transfer_question: { title: '结案权限解锁', detail: '只剩最后一个判断', tone: 'blue' },
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
  const [phaseTransition, setPhaseTransition] = useState<PhaseTransitionCue>()
  const [hintStage, setHintStage] = useState<Stage>()
  const [observationAnswer, setObservationAnswer] = useState<string>()
  const [sensorReads, setSensorReads] = useState<FeatureKey[]>([])
  const [repairSensorReads, setRepairSensorReads] = useState<FeatureKey[]>([])
  const [modelConfirmed, setModelConfirmed] = useState(false)
  const [successPrediction, setSuccessPrediction] = useState<string>()
  const [evidenceInference, setEvidenceInference] = useState<string>()
  const [overfitReflection, setOverfitReflection] = useState<string>()
  const [finalReflection, setFinalReflection] = useState<string>()
  const [experimentLog, setExperimentLog] = useState<ExperimentRecord[]>([])
  const logger = useRef<BehaviorLogger>(new BehaviorLogger(seed))
  const completionLogged = useRef(false)
  const audio = useRef(new GameAudio(true))
  const previousStage = useRef<Stage>('briefing')
  const previousPhase = useRef<GameMusicPhase>(1)

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

    // A phase gate already communicates the phase change. Do not immediately repeat
    // the same information as a toast; reserve rewards for actual discoveries/results.
    if (!debug && PHASE_TRANSITION[state.stage]) {
      setRewardNotice(undefined)
      return
    }

    setRewardNotice({ stage: state.stage, ...reward })
    const rewardSound = state.stage === 'inspect_errors' || state.stage === 'overfit_reveal'
      ? 'warning'
      : reward.tone === 'yellow' ? 'success' : 'select'
    audio.current.play(rewardSound)
    const hideTimer = window.setTimeout(() => setRewardNotice(undefined), reward.important ? 7000 : 4800)
    return () => window.clearTimeout(hideTimer)
  }, [debug, state.stage])

  useEffect(() => {
    if (debug) return
    const nextPhase = musicPhaseFor(state.stage)
    if (nextPhase === previousPhase.current) return
    previousPhase.current = nextPhase

    const cue = PHASE_TRANSITION[state.stage]
    if (!cue) return
    setPhaseTransition(cue)
    audio.current.play(state.stage === 'hidden_test' ? 'audit' : state.stage === 'transfer_question' ? 'success' : 'select')
    const timer = window.setTimeout(() => setPhaseTransition(undefined), 1900)
    return () => window.clearTimeout(timer)
  }, [debug, state.stage])

  useEffect(() => {
    audio.current.setPhase(musicPhaseFor(state.stage))
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

  const readSensor = (feature: FeatureKey) => {
    audio.current.play('select')
    setSensorReads((current) => current.includes(feature) ? current : [...current, feature])
    record(`READ_SENSOR:${feature}`)
  }

  const readRepairSensor = (feature: FeatureKey) => {
    audio.current.play('select')
    setRepairSensorReads((current) => current.includes(feature) ? current : [...current, feature])
    record(`READ_REPAIR_SENSOR:${feature}`)
  }

  const setModel = (model: ModelId) => {
    audio.current.play('select')
    setSelectedMistake(undefined)
    if (state.stage === 'choose_model') setModelConfirmed(true)
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
    setExperimentLog((records) => [...records, {
      id: records.length + 1,
      model: state.selectedModel,
      features: [...state.selectedFeatures],
      trainAccuracy: state.training?.accuracy ?? evaluate(model, trainPoints).accuracy,
      auditAccuracy: result.accuracy,
      errors: result.errorCount,
    }])
    dispatch({ type: 'AUDIT_RESULT', result })
    setSelectedMistake(result.mistakes[0]?.id)
  }

  const viewMistake = (id: string) => {
    audio.current.play('evidence')
    setSelectedMistake(id)
    record('VIEW_MISTAKE', { mistakeId: id })
    dispatch({ type: 'VIEW_MISTAKE', id })

    // The evidence card sits below the scanner. Bring it into view after React has
    // rendered the selected sample so "inspect one mistake" means actually seeing it.
    window.setTimeout(() => {
      const evidence = document.querySelector<HTMLElement>('.evidence-console')
      if (!evidence) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      evidence.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
    }, 80)
  }

  const requestHint = () => {
    audio.current.play('hint')
    const next = Math.min(3, state.hintLevel + 1) as 1 | 2 | 3
    record('REQUEST_HINT', { hintLevel: next })
    setHintStage(state.stage)
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
    setEntryPhase('incident')
  }

  const completeIncident = () => {
    audio.current.play('evidence')
    record('INCIDENT_CONFIRMED')
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

  const observationCorrect = observationAnswer === 'clusters'
  const evidenceCorrect = evidenceInference === 'feature-gap'
  const overfitCorrect = overfitReflection === 'memorized'
  const finalCorrect = finalReflection === 'unknown-stable'
  const clueCount = [observationCorrect, evidenceCorrect, state.hasSeenOverfit && overfitCorrect, finalCorrect].filter(Boolean).length
  const showSensorIntro = !debug && state.stage === 'choose_features'
  const repairSensorsReady = repairSensorReads.length >= 2
  const showFeaturePicker = debug
    ? STAGE_INDEX[state.stage] >= STAGE_INDEX.choose_features && !['final_audit', 'transfer_question', 'complete'].includes(state.stage)
    : state.stage === 'iterate' && state.hasSeenOverfit && repairSensorsReady
  const showModelPicker = debug
    ? STAGE_INDEX[state.stage] >= STAGE_INDEX.choose_model && !['final_audit', 'transfer_question', 'complete'].includes(state.stage)
    : state.stage === 'choose_model' || (state.stage === 'iterate' && (!state.hasSeenOverfit || repairSensorsReady))
  const featureDisabled = !debug && state.stage !== 'iterate'
  const modelDisabled = !debug && !['choose_model', 'iterate'].includes(state.stage)

  const guideOverride = (() => {
    switch (state.stage) {
      case 'inspect_data': return observationCorrect
        ? { title: '第一条线索已确认', line: '旧样本确实有明显分布。下一步查机器人到底看了哪些信息。', cue: '检查机器人的眼睛' }
        : { title: '先做一个肉眼判断', line: '不用懂坐标。只回答：橘猫和面包是不是大致聚成两团？', cue: '观察后作答' }
      case 'choose_features': return sensorReads.length < 2
        ? { title: `读取两个观察通道 ${sensorReads.length}/2`, line: '依次点开 X、Y。机器人并没有“看懂图片”，它只收到两串数字。', cue: '点开两个通道' }
        : { title: '你已经知道它看什么了', line: '当前事故机器人只看“颜色暖度 + 轮廓圆度”。先保留原配置，看看它能学成什么样。', cue: '继续检查模型' }
      case 'choose_model': return modelConfirmed
        ? { title: '直线工具已确认', line: '它只会画一条线，把两边分开。现在真正训练一次。', cue: '进入训练' }
        : { title: '亲手装载第一个判断工具', line: '现在只有一个模型可用。点一下“直线分类器”，建立可点击控件的直觉。', cue: '点直线分类器' }
      case 'first_success': return successPrediction
        ? { title: '预测已记入案件本', line: '现在别猜了。把从未参加训练的新样本放进来验证。', cue: '接受现场抽查' }
        : { title: '先别庆祝，做个预测', line: '旧样本 89%。你觉得这已经证明机器人真的修好了吗？', cue: '先回答下面的问题' }
      case 'inspect_errors': {
        if (state.viewedMistakes.length < 2) return { title: `收集两条错误证据 ${state.viewedMistakes.length}/2`, line: '点击两个不同的黄色「!」。不要只看总分，看看错误长什么样。', cue: '继续调查误判' }
        if (!evidenceCorrect) return { title: '把两条证据串起来', line: '你已经看了两个错误。现在判断：问题更像出在“观察信息”还是随机倒霉？', cue: '完成证据推理' }
        return { title: '证据链完成', line: '当前观察方式会把某些猫和面包看得太像。带着这条线索进入修复。', cue: '开始修复' }
      }
      case 'iterate': return state.hasSeenOverfit
        ? repairSensorsReady
          ? { title: '利用证据修复，而不是碰运气', line: '备用通道已读完。现在换掉不稳的观察方式，再选择一个不过度贴旧样本的模型。', cue: '设计第三个方案' }
          : { title: `解锁备用观察通道 ${repairSensorReads.length}/2`, line: '技术组刚恢复“表面纹理”和“长宽比例”。先把两个模块读完，再决定怎么装。', cue: '读取两个备用模块' }
        : { title: '做一次极端实验', line: '先故意选 k=1。它最擅长“记住最近的旧样本”，看看训练满分能不能救它。', cue: '选择 k=1 → 训练 → 审计' }
      case 'overfit_reveal': return overfitCorrect
        ? { title: '你找到了真正的陷阱', line: '训练 100% 不等于学会了规律。现在回去设计一个更稳的方案。', cue: '重新设计' }
        : { title: '先解释这个反常现象', line: '旧样本 100%，新样本却更差。哪一种解释最合理？', cue: '完成判断' }
      case 'final_audit': return finalCorrect
        ? { title: '修复证据成立', line: '不是旧题更满，而是新样本真正稳定了。最后把经验迁移出去。', cue: '进入结案问题' }
        : { title: '别只看“通过”两个字', line: '比较案件记录：这次真正值得信任的证据是什么？', cue: '完成最终判断' }
      default: return undefined
    }
  })()

  const stageAction = () => {
    switch (state.stage) {
      case 'briefing': return <ActionButton onClick={() => send({ type: 'START' })}>接受事故调查</ActionButton>
      case 'inspect_data': return debug || observationCorrect ? <ActionButton onClick={() => send({ type: 'OBSERVE_DONE' })}>去看机器人到底看了什么</ActionButton> : null
      case 'choose_features': return debug || sensorReads.length >= 2 ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>保留原观察方式，继续调查</ActionButton> : null
      case 'choose_model': return debug || modelConfirmed ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>确认装载这个模型</ActionButton> : null
      case 'train': return <ActionButton onClick={train}>训练模型并画出边界</ActionButton>
      case 'first_success': return debug || successPrediction ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>用没见过的新样本验证</ActionButton> : null
      case 'hidden_test': return <ActionButton onClick={audit}>放入 24 个未知样本</ActionButton>
      case 'inspect_errors': return state.viewedMistakes.length >= 2 && evidenceCorrect ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>带着两条证据开始修复</ActionButton> : null
      case 'iterate': {
        if (!debug && !state.hasSeenOverfit && state.selectedModel !== 'knn-1') return null
        if (!debug && state.hasSeenOverfit && !repairSensorsReady) return null
        return (
          <div className="dual-actions">
            <ActionButton onClick={train}>训练当前方案</ActionButton>
            <ActionButton kind="secondary" disabled={!state.training} onClick={audit}>
              {state.training ? '用未知数据审计' : '先训练，再审计'}
            </ActionButton>
          </div>
        )
      }
      case 'overfit_reveal': return debug || overfitCorrect ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>带着“过拟合”线索重新设计</ActionButton> : null
      case 'final_audit': return debug || finalCorrect ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>进入最后一问</ActionButton> : null
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
        onIncidentComplete={completeIncident}
        onComplete={completeEntry}
        audioEnabled={audioEnabled}
      />
    )
  }

  return (
    <main
      className="app-shell"
      data-stage={state.stage}
      data-mistake-viewed={state.viewedMistakes.length >= 2 ? 'true' : 'false'}
      style={{ '--motion-duration': `${motionDuration}ms` } as React.CSSProperties}
    >
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

      <TaskBanner stage={state.stage} clues={clueCount} />
      <StageReward key={rewardNotice?.stage ?? 'reward-empty'} notice={rewardNotice} onDismiss={() => setRewardNotice(undefined)} />
      <PhaseTransition cue={phaseTransition} onDismiss={() => setPhaseTransition(undefined)} />
      {!debug && <GuideConnector stage={state.stage} mistakeViewed={state.viewedMistakes.length >= 2} />}

      {isBriefing ? (
        <div className="briefing-game-layout">
          {!debug && <BeginnerGuide stage={state.stage} />}
          <IncidentScene />
          <div className="briefing-bottom-row">
            <AssistantPanel state={state} onHint={requestHint} floating={!debug} showHint={hintStage === state.stage} />
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
            {!debug && (
              <BeginnerGuide
                stage={state.stage}
                compact
                action={currentAction}
                mistakeViewed={state.viewedMistakes.length >= 2}
                override={guideOverride}
              />
            )}

            {!debug && state.stage === 'inspect_data' && (
              <InvestigationPrompt
                number="01 / SAMPLE ARCHIVE"
                title="不用懂坐标：你肉眼看到了什么？"
                question="只看橘猫和面包的位置。旧样本现在呈现出哪种最明显的结构？"
                value={observationAnswer}
                onChange={(value) => { audio.current.play('select'); setObservationAnswer(value); record(`OBSERVATION:${value}`) }}
                options={[
                  { id: 'clusters', label: '它们大致聚成了两团', correct: true },
                  { id: 'mixed', label: '它们完全混在一起', correct: false },
                  { id: 'random', label: '看起来没有任何规律', correct: false },
                ]}
                successText="线索 01：旧样本确实存在可利用的分布。接下来查机器人到底用了什么信息看出这两团。"
              />
            )}

            {!debug && state.stage === 'first_success' && (
              <InvestigationPrompt
                number="02 / PREDICTION"
                title="旧样本表现不错。它真的修好了吗？"
                question="先留下你的预测，不会扣分。下一步会用一批它从没见过的样本验证。"
                value={successPrediction}
                onChange={(value) => { audio.current.play('select'); setSuccessPrediction(value); record(`PREDICT_GENERALIZATION:${value}`) }}
                options={[
                  { id: 'fixed', label: '89% 已经足以证明它修好了' },
                  { id: 'need-new', label: '还不能确定，应该看看新样本' },
                ]}
                evaluate={false}
                successText="预测已记入案件本。现在用未知样本把猜测变成证据。"
              />
            )}

            {!debug && state.stage === 'inspect_errors' && state.viewedMistakes.length >= 2 && (
              <InvestigationPrompt
                number="03 / EVIDENCE LINK"
                title="两条误判证据在告诉你什么？"
                question="结合当前只使用“颜色暖度 + 轮廓圆度”，哪种解释更值得继续调查？"
                value={evidenceInference}
                onChange={(value) => { audio.current.play('select'); setEvidenceInference(value); record(`EVIDENCE_INFERENCE:${value}`) }}
                options={[
                  { id: 'feature-gap', label: '当前两项信息会把一些猫和面包看得太像', correct: true },
                  { id: 'random-bad-luck', label: '只是随机倒霉，多训练几次就会自己消失', correct: false },
                  { id: 'need-score', label: '只要把旧样本分数继续刷高就够了', correct: false },
                ]}
                successText="线索 02：错误集中暴露了观察信息的盲区。修复时应该尝试换“眼睛”，而不只是追训练分数。"
              />
            )}

            {showSensorIntro && (
              <SensorIntro features={state.selectedFeatures} read={sensorReads} onRead={readSensor} />
            )}

            {!debug && state.stage === 'iterate' && state.hasSeenOverfit && !repairSensorsReady && (
              <SensorIntro
                features={['texture', 'aspect']}
                read={repairSensorReads}
                onRead={readRepairSensor}
                mode="repair"
              />
            )}

            {showFeaturePicker && (
              <FeaturePicker value={state.selectedFeatures} disabled={featureDisabled} onChange={setFeatures} />
            )}

            {showModelPicker && (
              <ModelPicker selected={state.selectedModel} unlocked={availableModels} disabled={modelDisabled} onChange={setModel} />
            )}

            {state.stage === 'overfit_reveal' && state.training && state.audit && !overfitCorrect && (
              <InvestigationPrompt
                number="04 / PATTERN FAILURE"
                title="100% 的训练分，为什么反而更危险？"
                question={`这个方案旧样本 ${Math.round(state.training.accuracy * 100)}%，未知样本 ${Math.round(state.audit.accuracy * 100)}%。哪种解释最符合你刚看到的边界和错误？`}
                value={overfitReflection}
                onChange={(value) => { audio.current.play('select'); setOverfitReflection(value); record(`OVERFIT_REFLECTION:${value}`) }}
                options={[
                  { id: 'memorized', label: '它太贴着旧样本走，连噪声和偶然情况都记住了', correct: true },
                  { id: 'not-enough-score', label: '训练分还不够高，应该继续把旧样本刷得更满', correct: false },
                  { id: 'new-data-invalid', label: '新样本不可信，应该忽略未知审计', correct: false },
                ]}
                successText="线索 03：模型过度迎合训练数据。这个现象现在可以正式命名为——过拟合。"
              />
            )}

            {state.stage === 'overfit_reveal' && state.training && state.audit && overfitCorrect && (
              <section className="concept-card pixel-result-card warning-result">
                <span>FOUND / PATTERN_FAILURE</span>
                <h2>过拟合 / Overfitting</h2>
                <p>训练 {Math.round(state.training.accuracy * 100)}%，未知数据 {Math.round(state.audit.accuracy * 100)}%。模型把训练中的噪声也当成了规律。</p>
              </section>
            )}

            {state.stage === 'final_audit' && !finalCorrect && (
              <InvestigationPrompt
                number="05 / PATCH VERIFICATION"
                title="这次为什么比“训练 100%”更值得相信？"
                question="对照案件记录，什么证据说明修复真正解决了现场问题？"
                value={finalReflection}
                onChange={(value) => { audio.current.play('select'); setFinalReflection(value); record(`FINAL_REFLECTION:${value}`) }}
                options={[
                  { id: 'unknown-stable', label: '没见过的新样本也稳定，误判真正下降了', correct: true },
                  { id: 'highest-train', label: '因为训练分终于是所有方案里最高的', correct: false },
                  { id: 'complex-model', label: '因为最终模型一定比之前更复杂', correct: false },
                ]}
                successText="线索 04：真正可靠的是未知数据上的稳定表现。你已经亲手验证了“泛化”。"
              />
            )}

            {state.stage === 'final_audit' && finalCorrect && (
              <section className="concept-card success-card pixel-result-card">
                <span>PATCH / VERIFIED</span>
                <h2>不是训练满分，而是新样本也站得住。</h2>
                <p>这就是你刚亲手验证的“泛化”：规则能否应对没见过的数据。</p>
              </section>
            )}

            {!debug && ['iterate', 'overfit_reveal', 'final_audit', 'transfer_question', 'complete'].includes(state.stage) && (
              <CaseAttempts records={experimentLog} />
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

            {debug && currentAction && <section className="pixel-command-dock">{currentAction}</section>}
            <AssistantPanel state={state} onHint={requestHint} floating={!debug} showHint={hintStage === state.stage} />
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
