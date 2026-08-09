import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AssistantPanel } from './components/AssistantPanel'
import { BeginnerGuide } from './components/BeginnerGuide'
import { CaseAttempts, type ExperimentRecord } from './components/CaseAttempts'
import { CaseRating } from './components/CaseRating'
import { DebugPanel } from './components/DebugPanel'
import { EntryExperience, type EntryPhase } from './components/EntryExperience'
import { ErrorSamples } from './components/ErrorSamples'
import { ExperimentPlan, type ExperimentPrediction } from './components/ExperimentPlan'
import { FeaturePicker } from './components/FeaturePicker'
import { GuideConnector } from './components/GuideConnector'
import { InvestigationPrompt } from './components/InvestigationPrompt'
import { Metrics } from './components/Metrics'
import { ModelPicker } from './components/ModelPicker'
import { PhaseTransition, type PhaseTransitionCue } from './components/PhaseTransition'
import { IncidentScene } from './components/PixelScene'
import { PredictionOutcome } from './components/PredictionOutcome'
import { ScatterPlot } from './components/ScatterPlot'
import { SampleHunt } from './components/SampleHunt'
import { SensorIntro } from './components/SensorIntro'
import { StageReward, type RewardNotice } from './components/StageReward'
import { TaskBanner } from './components/TaskBanner'
import { TRANSFER_QUESTION, unlockedModels } from './content/level1'
import { BootCase } from './endless/BootCase'
import { EndlessIntro } from './endless/EndlessIntro'
import { EndlessMode } from './endless/EndlessMode'
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

function predictionMatches(
  prediction: ExperimentPrediction | undefined,
  trainAccuracy: number,
  auditAccuracy: number,
  previous?: ExperimentRecord,
): boolean | undefined {
  if (!prediction || prediction === 'no-idea' || !previous) return undefined
  if (prediction === 'train-up-test-down') {
    return trainAccuracy > previous.trainAccuracy + 0.04 && auditAccuracy < previous.auditAccuracy - 0.01
  }
  if (prediction === 'test-improves') {
    return auditAccuracy > previous.auditAccuracy + 0.08
  }
  if (prediction === 'both-improve') {
    return trainAccuracy > previous.trainAccuracy + 0.01 && auditAccuracy > previous.auditAccuracy + 0.01
  }
  return undefined
}

function GameSession({ seed, debug, onSeedChange, onRestart, onEndless }: {
  seed: number
  debug: boolean
  onSeedChange: (seed: number) => void
  onRestart: () => void
  onEndless?: () => void
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
  const [suspectSampleId, setSuspectSampleId] = useState<string>()
  const [sensorReads, setSensorReads] = useState<FeatureKey[]>([])
  const [repairSensorReads, setRepairSensorReads] = useState<FeatureKey[]>([])
  const [modelConfirmed, setModelConfirmed] = useState(false)
  const [boundaryProbeAnswer, setBoundaryProbeAnswer] = useState<string>()
  const [successPrediction, setSuccessPrediction] = useState<string>()
  const [evidenceInference, setEvidenceInference] = useState<string>()
  const [suspiciousAttemptId, setSuspiciousAttemptId] = useState<number>()
  const [overfitReflection, setOverfitReflection] = useState<string>()
  const [finalReflection, setFinalReflection] = useState<string>()
  const [experimentLog, setExperimentLog] = useState<ExperimentRecord[]>([])
  const [pendingPrediction, setPendingPrediction] = useState<ExperimentPrediction>()
  const [auditCredits, setAuditCredits] = useState(4)
  const [emergencyAudits, setEmergencyAudits] = useState(0)
  const [reasoningMisses, setReasoningMisses] = useState(0)
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
  const boundaryProbeSample = state.stage === 'first_success' ? service.publicTest[12] : undefined
  const boundaryProbePrediction = fitted && boundaryProbeSample
    ? fitted.predict({
        x: boundaryProbeSample.features[state.selectedFeatures[0]],
        y: boundaryProbeSample.features[state.selectedFeatures[1]],
      })
    : undefined
  const boundaryProbeCorrect = Boolean(boundaryProbeAnswer && boundaryProbeAnswer === boundaryProbePrediction)
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
    setPendingPrediction(undefined)
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
    setPendingPrediction(undefined)
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
    if (!debug && state.stage === 'iterate' && auditCredits <= 0) {
      audio.current.play('warning')
      record('AUDIT_BLOCKED_NO_CREDIT')
      return
    }
    audio.current.play('audit')
    const model = fitted ?? MODEL_REGISTRY[state.selectedModel].fit(trainPoints)
    const result = service.audit(model, state.selectedFeatures)
    const trainAccuracy = state.training?.accuracy ?? evaluate(model, trainPoints).accuracy
    const previous = experimentLog.at(-1)
    const matched = predictionMatches(pendingPrediction, trainAccuracy, result.accuracy, previous)
    record('RUN_AUDIT', { testAccuracy: result.accuracy })
    setExperimentLog((records) => [...records, {
      id: records.length + 1,
      model: state.selectedModel,
      features: [...state.selectedFeatures],
      trainAccuracy,
      auditAccuracy: result.accuracy,
      errors: result.errorCount,
      prediction: state.stage === 'iterate' ? pendingPrediction : undefined,
      predictionMatched: state.stage === 'iterate' ? matched : undefined,
    }])
    if (!debug && state.stage === 'iterate') setAuditCredits((value) => Math.max(0, value - 1))
    setPendingPrediction(undefined)
    dispatch({ type: 'AUDIT_RESULT', result })
    setSelectedMistake(result.mistakes[0]?.id)
  }

  const requestEmergencyAudit = () => {
    audio.current.play('warning')
    setAuditCredits((value) => value + 1)
    setEmergencyAudits((value) => value + 1)
    record('REQUEST_EMERGENCY_AUDIT')
  }

  const viewMistake = (id: string) => {
    audio.current.play('evidence')
    setSelectedMistake(id)
    record('VIEW_MISTAKE', { mistakeId: id })
    if (state.stage === 'inspect_errors') dispatch({ type: 'VIEW_MISTAKE', id })

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
  const suspectCorrect = Boolean(suspectSampleId && trainPoints.find((point) => point.id === suspectSampleId)?.source.flags?.outlier)
  const evidenceCorrect = evidenceInference === 'feature-gap'
  const suspiciousAttemptCorrect = Boolean(suspiciousAttemptId && suspiciousAttemptId === experimentLog.at(-1)?.id)
  const overfitCorrect = overfitReflection === 'memorized'
  const finalCorrect = finalReflection === 'unknown-stable'
  const predictionHits = experimentLog.filter((record) => record.predictionMatched === true).length
  const predictionMisses = experimentLog.filter((record) => record.predictionMatched === false).length
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
      case 'inspect_data': return !observationCorrect
        ? { title: '先做一个肉眼判断', line: '不用懂坐标。只回答：橘猫和面包是不是大致聚成两团？', cue: '观察后作答' }
        : !suspectCorrect
          ? { title: '现在别看按钮，直接点图', line: '两团里混着几个很反常的旧样本。找一个“站进对面阵营”的点，直接在散点图上标记。', cue: '在左图点一个可疑样本' }
          : { title: '你抓到了旧数据里的噪声', line: '这类反常点以后会成为重要证据。下一步再查机器人到底看了哪些信息。', cue: '检查机器人的眼睛' }
      case 'choose_features': return sensorReads.length < 2
        ? { title: `读取两个观察通道 ${sensorReads.length}/2`, line: '依次点开 X、Y。机器人并没有“看懂图片”，它只收到两串数字。', cue: '点开两个通道' }
        : { title: '你已经知道它看什么了', line: '当前事故机器人只看“颜色暖度 + 轮廓圆度”。先保留原配置，看看它能学成什么样。', cue: '继续检查模型' }
      case 'choose_model': return modelConfirmed
        ? { title: '直线工具已确认', line: '它只会画一条线，把两边分开。现在真正训练一次。', cue: '进入训练' }
        : { title: '亲手装载第一个判断工具', line: '现在只有一个模型可用。点一下“直线分类器”，建立可点击控件的直觉。', cue: '点直线分类器' }
      case 'first_success': return !boundaryProbeCorrect
        ? { title: '先读一遍模型的边界', line: '图里出现了一个 PROBE ?。别猜它真实是什么，只判断：按当前颜色区域，模型会把它判成哪一类？', cue: '读图后锁定模型预测' }
        : successPrediction
          ? { title: '现实预测已记入案件本', line: '你已经会读模型了。现在把从未参加训练的新样本放进来，看看现实是否同意。', cue: '接受现场抽查' }
          : { title: '模型会说什么 ≠ 它真实是什么', line: '你刚读懂了决策区域。现在再判断：旧样本 89%，这足以证明机器人真的修好了吗？', cue: '回答上线判断' }
      case 'inspect_errors': {
        if (state.viewedMistakes.length < 2) return { title: `收集两条错误证据 ${state.viewedMistakes.length}/2`, line: '点击两个不同的黄色「!」。不要只看总分，看看错误长什么样。', cue: '继续调查误判' }
        if (!evidenceCorrect) return { title: '把两条证据串起来', line: '你已经看了两个错误。现在判断：问题更像出在“观察信息”还是随机倒霉？', cue: '完成证据推理' }
        return { title: '证据链完成', line: '当前观察方式会把某些猫和面包看得太像。带着这条线索进入修复。', cue: '开始修复' }
      }
      case 'iterate': return state.hasSeenOverfit
        ? !repairSensorsReady
          ? { title: `解锁备用观察通道 ${repairSensorReads.length}/2`, line: '技术组刚恢复“表面纹理”和“长宽比例”。先把两个模块读完，再决定怎么装。', cue: '读取两个备用模块' }
          : !pendingPrediction
            ? { title: '先提出一个可验证的预测', line: '换完观察方式和模型以后，不要直接按训练。先写下：你认为未知样本会不会真正改善。', cue: '在实验协议里下注' }
            : { title: '现在用实验验证你的预测', line: `正式审计还剩 ${auditCredits} 次。训练只是准备，真正花额度的是未知样本审计。`, cue: '训练 → 审计 → 对照预测' }
        : state.selectedModel !== 'knn-1'
          ? { title: '做一次极端实验', line: '先故意选 k=1。它最擅长“记住最近的旧样本”，看看训练满分能不能救它。', cue: '选择 k=1' }
          : !pendingPrediction
            ? { title: '别急着训练，先下注', line: '你准备让模型更贴旧样本。先预测：训练分更高以后，未知样本会怎样？', cue: '填写实验前预测' }
            : { title: '预测已锁定', line: `现在可以训练并审计。正式审计还剩 ${auditCredits} 次。`, cue: '训练 → 未知审计' }
      case 'overfit_reveal': return !suspiciousAttemptCorrect
        ? { title: '先从案件记录里指出异常', line: '两次实验都在右边。哪一次“旧样本更高、未知样本反而更差”？先点那条记录。', cue: '点击最可疑实验' }
        : overfitCorrect
          ? { title: '你找到了真正的陷阱', line: '训练 100% 不等于学会了规律。现在回去设计一个更稳的方案。', cue: '重新设计' }
          : { title: '记录找对了，再解释原因', line: '你已经指出 100% / 63% 那次实验。现在解释：为什么更贴旧样本反而更危险？', cue: '完成判断' }
      case 'final_audit': return finalCorrect
        ? { title: '修复证据成立', line: '不是旧题更满，而是新样本真正稳定了。最后把经验迁移出去。', cue: '进入结案问题' }
        : { title: '别只看“通过”两个字', line: '比较案件记录：这次真正值得信任的证据是什么？', cue: '完成最终判断' }
      default: return undefined
    }
  })()

  const stageAction = () => {
    switch (state.stage) {
      case 'briefing': return <ActionButton onClick={() => send({ type: 'START' })}>接受事故调查</ActionButton>
      case 'inspect_data': return debug || (observationCorrect && suspectCorrect) ? <ActionButton onClick={() => send({ type: 'OBSERVE_DONE' })}>带着异常样本线索继续调查</ActionButton> : null
      case 'choose_features': return debug || sensorReads.length >= 2 ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>保留原观察方式，继续调查</ActionButton> : null
      case 'choose_model': return debug || modelConfirmed ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>确认装载这个模型</ActionButton> : null
      case 'train': return <ActionButton onClick={train}>训练模型并画出边界</ActionButton>
      case 'first_success': return debug || (boundaryProbeCorrect && successPrediction) ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>用没见过的新样本验证</ActionButton> : null
      case 'hidden_test': return <ActionButton onClick={audit}>放入 24 个未知样本</ActionButton>
      case 'inspect_errors': return state.viewedMistakes.length >= 2 && evidenceCorrect ? <ActionButton onClick={() => send({ type: 'ADVANCE' })}>带着两条证据开始修复</ActionButton> : null
      case 'iterate': {
        if (!debug && !state.hasSeenOverfit && state.selectedModel !== 'knn-1') return null
        if (!debug && state.hasSeenOverfit && !repairSensorsReady) return null
        if (!debug && !pendingPrediction) return null
        return (
          <div className="dual-actions">
            <ActionButton onClick={train}>训练当前方案</ActionButton>
            <ActionButton kind="secondary" disabled={!state.training || (!debug && auditCredits <= 0)} onClick={audit}>
              {state.training ? (auditCredits > 0 || debug ? `未知审计 · 剩 ${auditCredits}` : '审计额度耗尽') : '先训练，再审计'}
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
        onEndless={onEndless}
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
            {!debug && state.stage === 'inspect_errors' && state.audit && (
              <PredictionOutcome prediction={successPrediction} accuracy={state.audit.accuracy} errors={state.audit.errorCount} />
            )}

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
              trainingProbe={!debug && state.stage === 'inspect_data' && observationCorrect}
              selectedTrainingSample={state.stage === 'inspect_data' ? suspectSampleId : undefined}
              onSelectTrainingSample={(id) => {
                audio.current.play('evidence')
                const picked = trainPoints.find((point) => point.id === id)
                if (!picked?.source.flags?.outlier) setReasoningMisses((count) => count + 1)
                setSuspectSampleId(id)
                record(`PROBE_TRAIN_SAMPLE:${id}`)
              }}
              previewSample={boundaryProbeSample}
            />

            {showMetrics && <Metrics training={state.training} audit={state.audit} model={state.selectedModel} />}

            <ErrorSamples
              audit={state.audit}
              selectedFeatures={state.selectedFeatures}
              viewed={state.viewedMistakes}
              selectedId={selectedMistake}
              onSelect={viewMistake}
              investigationTarget={state.stage === 'inspect_errors' ? 2 : undefined}
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

            {!debug && state.stage === 'inspect_data' && !observationCorrect && (
              <InvestigationPrompt
                number="01 / SAMPLE ARCHIVE"
                title="不用懂坐标：你肉眼看到了什么？"
                question="只看橘猫和面包的位置。旧样本现在呈现出哪种最明显的结构？"
                value={observationAnswer}
                onChange={(value) => { audio.current.play('select'); if (value !== 'clusters') setReasoningMisses((count) => count + 1); setObservationAnswer(value); record(`OBSERVATION:${value}`) }}
                options={[
                  { id: 'clusters', label: '它们大致聚成了两团', correct: true },
                  { id: 'mixed', label: '它们完全混在一起', correct: false },
                  { id: 'random', label: '看起来没有任何规律', correct: false },
                ]}
                successText="第一眼没错：大部分旧样本确实分成两团。但先别走——图里还有几个反常点值得抓出来。"
              />
            )}

            {!debug && state.stage === 'inspect_data' && observationCorrect && (
              <SampleHunt
                selectedId={suspectSampleId}
                correct={suspectCorrect}
                onClear={() => setSuspectSampleId(undefined)}
              />
            )}

            {!debug && state.stage === 'first_success' && !boundaryProbeCorrect && boundaryProbePrediction && (
              <InvestigationPrompt
                number="02 / MODEL READOUT"
                title="这个 PROBE ? 会被模型判成什么？"
                question="只读当前决策区域的颜色，不判断它真实是什么。模型本身会给出哪个答案？"
                value={boundaryProbeAnswer}
                onChange={(value) => {
                  audio.current.play('select')
                  if (value !== boundaryProbePrediction) setReasoningMisses((count) => count + 1)
                  setBoundaryProbeAnswer(value)
                  record(`BOUNDARY_PROBE:${value}`)
                }}
                options={[
                  { id: 'cat', label: '模型会判成：猫', correct: boundaryProbePrediction === 'cat' },
                  { id: 'bread', label: '模型会判成：面包', correct: boundaryProbePrediction === 'bread' },
                ]}
                successText="读对了。但注意：你刚读懂的是模型的判断区域，不是这个样本的真实答案。"
                retryText="再看左边 PROBE ? 周围的决策底色。这里问的是模型会说什么，不是你觉得它真实是什么。"
              />
            )}

            {!debug && state.stage === 'first_success' && boundaryProbeCorrect && (
              <InvestigationPrompt
                number="03 / DEPLOYMENT PREDICTION"
                title="旧样本表现不错。它真的修好了吗？"
                question="现在才判断现实：先留下你的预测。下一步会用一批它从没见过的样本验证。"
                value={successPrediction}
                onChange={(value) => { audio.current.play('select'); setSuccessPrediction(value); record(`PREDICT_GENERALIZATION:${value}`) }}
                options={[
                  { id: 'fixed', label: '89% 已经足以证明它修好了' },
                  { id: 'need-new', label: '还不能确定，应该看看新样本' },
                ]}
                evaluate={false}
                successText="现实预测已记入案件本。现在用未知样本把猜测变成证据。"
              />
            )}

            {!debug && state.stage === 'inspect_errors' && state.viewedMistakes.length >= 2 && (
              <InvestigationPrompt
                number="04 / EVIDENCE LINK"
                title="两条误判证据在告诉你什么？"
                question="结合当前只使用“颜色暖度 + 轮廓圆度”，哪种解释更值得继续调查？"
                value={evidenceInference}
                onChange={(value) => { audio.current.play('select'); if (value !== 'feature-gap') setReasoningMisses((count) => count + 1); setEvidenceInference(value); record(`EVIDENCE_INFERENCE:${value}`) }}
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

            {!debug && state.stage === 'iterate' && (
              (!state.hasSeenOverfit && state.selectedModel === 'knn-1') || (state.hasSeenOverfit && repairSensorsReady)
            ) && (
              <ExperimentPlan
                phase={state.hasSeenOverfit ? 'repair' : 'trap'}
                value={pendingPrediction}
                credits={auditCredits}
                onChange={(value) => {
                  audio.current.play('select')
                  setPendingPrediction(value)
                  record(`LOCK_PREDICTION:${value}`)
                }}
                onEmergencyCredit={requestEmergencyAudit}
              />
            )}

            {state.stage === 'overfit_reveal' && state.training && state.audit && suspiciousAttemptCorrect && !overfitCorrect && (
              <InvestigationPrompt
                number="05 / PATTERN FAILURE"
                title="100% 的训练分，为什么反而更危险？"
                question={`这个方案旧样本 ${Math.round(state.training.accuracy * 100)}%，未知样本 ${Math.round(state.audit.accuracy * 100)}%。哪种解释最符合你刚看到的边界和错误？`}
                value={overfitReflection}
                onChange={(value) => { audio.current.play('select'); if (value !== 'memorized') setReasoningMisses((count) => count + 1); setOverfitReflection(value); record(`OVERFIT_REFLECTION:${value}`) }}
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
                number="06 / PATCH VERIFICATION"
                title="这次为什么比“训练 100%”更值得相信？"
                question="对照案件记录，什么证据说明修复真正解决了现场问题？"
                value={finalReflection}
                onChange={(value) => { audio.current.play('select'); if (value !== 'unknown-stable') setReasoningMisses((count) => count + 1); setFinalReflection(value); record(`FINAL_REFLECTION:${value}`) }}
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
              <CaseAttempts
                records={experimentLog}
                credits={state.stage === 'iterate' ? auditCredits : undefined}
                emergencyAudits={emergencyAudits}
                selectedId={state.stage === 'overfit_reveal' ? suspiciousAttemptId : undefined}
                selectionPrompt={state.stage === 'overfit_reveal' && !suspiciousAttemptCorrect ? '哪次实验最像“旧题更高、现场反而更差”？点一条记录。' : undefined}
                onSelect={state.stage === 'overfit_reveal' ? (id) => {
                  audio.current.play('select')
                  if (id !== experimentLog.at(-1)?.id) setReasoningMisses((count) => count + 1)
                  setSuspiciousAttemptId(id)
                  record(`COMPARE_ATTEMPT:${id}`)
                } : undefined}
              />
            )}

            {state.stage === 'transfer_question' && (
              <section className="transfer-lock-step">
                <InvestigationPrompt
                  number="07 / TRANSFER CHECK"
                  title="最后换个场景：你会怎么查？"
                  question={TRANSFER_QUESTION.prompt}
                  value={state.transferAnswer}
                  onChange={(value) => {
                    const option = TRANSFER_QUESTION.options.find((item) => item.id === value)!
                    audio.current.play('select')
                    record('ANSWER_TRANSFER')
                    if (!option.correct) setReasoningMisses((count) => count + 1)
                    dispatch({ type: 'ANSWER_TRANSFER', id: option.id, correct: option.correct })
                  }}
                  options={TRANSFER_QUESTION.options.map((option) => ({ id: option.id, label: option.label, correct: option.correct }))}
                  successText={TRANSFER_QUESTION.explanation}
                  retryText="这个判断还不够稳。回想刚才的案件：旧分数不是答案，先找能验证未知表现的证据。"
                />
                {state.transferCorrect && <ActionButton onClick={() => send({ type: 'ADVANCE' })}>提交调查报告</ActionButton>}
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
                {!debug && (
                  <CaseRating
                    experimentCount={experimentLog.length}
                    emergencyAudits={emergencyAudits}
                    hintLevel={state.hintLevel}
                    predictionHits={predictionHits}
                    predictionMisses={predictionMisses}
                    trustedOldScore={successPrediction === 'fixed'}
                    reasoningMisses={reasoningMisses}
                  />
                )}
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

const ENDLESS_BOOT_KEY = 'aia.boot-case-000.v2'

function App() {
  const params = new URLSearchParams(window.location.search)
  const debug = params.get('debug') === '1'
  const initialSeed = Number(params.get('seed')) || 20260809
  const [seed, setSeed] = useState(initialSeed)
  const [session, setSession] = useState(0)
  const requestedMode = params.get('mode')
  const [mode, setMode] = useState<'story' | 'endless-intro' | 'boot' | 'endless'>(
    requestedMode === 'endless' ? 'endless' : requestedMode === 'boot' ? 'boot' : 'story',
  )
  const [bootCompleted, setBootCompleted] = useState(() => window.localStorage.getItem(ENDLESS_BOOT_KEY) === 'complete')

  const changeSeed = (nextSeed: number) => {
    setSeed(nextSeed)
    setSession((value) => value + 1)
  }

  if (!debug && mode === 'endless-intro') {
    return <EndlessIntro bootCompleted={bootCompleted} onBoot={() => setMode('boot')} onSkip={() => setMode('endless')} onBack={() => setMode('story')} />
  }

  if (!debug && mode === 'boot') {
    return <BootCase onComplete={() => {
      window.localStorage.setItem(ENDLESS_BOOT_KEY, 'complete')
      setBootCompleted(true)
      setMode('endless')
    }} onBack={() => setMode('endless-intro')} />
  }

  if (!debug && mode === 'endless') {
    return <EndlessMode initialSeed={seed} onExit={() => setMode('story')} />
  }

  return (
    <GameSession
      key={`${seed}-${session}`}
      seed={seed}
      debug={debug}
      onSeedChange={changeSeed}
      onRestart={() => setSession((value) => value + 1)}
      onEndless={!debug ? () => setMode('endless-intro') : undefined}
    />
  )
}

export default App
