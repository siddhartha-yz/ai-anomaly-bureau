import type { FormalCaseId } from '../bureau/catalog'
import type { ExperimentRecord } from '../components/CaseAttempts'
import type { ExperimentPrediction } from '../components/ExperimentPlan'
import { TRANSFER_QUESTION } from '../content/level1'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import { createAuditService } from './audit'
import { predictionMatches } from './experiment'
import { createInitialGameState, gameReducer } from './reducer'
import { STORY_SESSION_VERSION, type StorySessionData } from './session'
import type { GameAction, GameState } from './types'

export const CHEAT_AUTO_RESUME_KEY = 'aia.cheat.auto-resume.v1'
export const CHEAT_FORMAL_CASE_ID_KEY = 'aia.cheat.formal-case-id.v1'

export type StoryCheatTarget = 'errors' | 'overfit' | 'repair' | 'final' | 'closed'

export type CheatInstruction =
  | { kind: 'help' }
  | { kind: 'story'; target: StoryCheatTarget; seed?: number }
  | { kind: 'story-reset'; seed?: number }
  | { kind: 'authored-case'; caseId: FormalCaseId; stageId?: string }
  | { kind: 'bureau-unlock' }
  | { kind: 'bureau' }
  | { kind: 'training' }
  | { kind: 'duty'; seed: number }

export type CheatParseResult =
  | { ok: true; instruction: CheatInstruction }
  | { ok: false; message: string }

const TARGET_ALIASES: Record<string, StoryCheatTarget> = {
  ERRORS: 'errors',
  ERROR: 'errors',
  EVIDENCE: 'errors',
  OVERFIT: 'overfit',
  TRAP: 'overfit',
  REPAIR: 'repair',
  FIX: 'repair',
  FINAL: 'final',
  AUDIT: 'final',
  CLOSED: 'closed',
  COMPLETE: 'closed',
}

function parsePositiveSeed(value: string | undefined) {
  if (!value) return undefined
  const seed = Number(value)
  return Number.isSafeInteger(seed) && seed > 0 ? seed : undefined
}

export function parseCheatCode(raw: string): CheatParseResult {
  const normalized = raw.trim().toUpperCase().replace(/[:@,]+/g, ' ').replace(/\s+/g, ' ')
  if (!normalized) return { ok: false, message: '请输入作弊码。输入 HELP 查看可用命令。' }
  const parts = normalized.split(' ')

  if (parts[0] === 'HELP' || parts[0] === '?') return { ok: true, instruction: { kind: 'help' } }
  if (parts[0] === 'TRAINING' || parts[0] === 'BOOT') return { ok: true, instruction: { kind: 'training' } }
  if (parts[0] === 'CASE002') {
    const stageId = ({ METRIC: 'split-metric', THRESHOLD: 'threshold', TRANSFER: 'transfer' } as const)[parts[1] as 'METRIC' | 'THRESHOLD' | 'TRANSFER']
    if (parts[1] && !stageId) return { ok: false, message: 'CASE002 跳转支持 METRIC / THRESHOLD / TRANSFER。' }
    return { ok: true, instruction: { kind: 'authored-case', caseId: 'story-002', stageId } }
  }
  if (parts[0] === 'CASE003') {
    const stageId = ({ CONTEXT: 'context', SENSOR: 'stable-sensor', CAUSAL: 'causal-reading' } as const)[parts[1] as 'CONTEXT' | 'SENSOR' | 'CAUSAL']
    if (parts[1] && !stageId) return { ok: false, message: 'CASE003 跳转支持 CONTEXT / SENSOR / CAUSAL。' }
    return { ok: true, instruction: { kind: 'authored-case', caseId: 'story-003', stageId } }
  }
  if (parts[0] === 'CASE004') {
    const stageId = ({ PROVENANCE: 'provenance', RESPLIT: 'resplit', MODEL: 'clean-model', COMPOSE: 'compose' } as const)[parts[1] as 'PROVENANCE' | 'RESPLIT' | 'MODEL' | 'COMPOSE']
    if (parts[1] && !stageId) return { ok: false, message: 'CASE004 跳转支持 PROVENANCE / RESPLIT / MODEL / COMPOSE。' }
    return { ok: true, instruction: { kind: 'authored-case', caseId: 'story-004', stageId } }
  }
  if (parts[0] === 'CASE005') {
    const stageId = ({ RELIABILITY: 'reliability', CALIBRATE: 'calibrate', POLICY: 'policy' } as const)[parts[1] as 'RELIABILITY' | 'CALIBRATE' | 'POLICY']
    if (parts[1] && !stageId) return { ok: false, message: 'CASE005 跳转支持 RELIABILITY / CALIBRATE / POLICY。' }
    return { ok: true, instruction: { kind: 'authored-case', caseId: 'story-005', stageId } }
  }

  if (parts[0] === 'BUREAU' || parts[0] === 'OFFICE') {
    if (parts[1] === 'UNLOCK') return { ok: true, instruction: { kind: 'bureau-unlock' } }
    if (parts.length === 1) return { ok: true, instruction: { kind: 'bureau' } }
    return { ok: false, message: 'BUREAU 只支持 BUREAU 或 BUREAU UNLOCK。' }
  }

  if (parts[0] === 'DUTY' || parts[0] === 'CASE') {
    const seed = parsePositiveSeed(parts[1])
    if (!seed) return { ok: false, message: '值班码格式：DUTY 6000（seed 必须是正整数）。' }
    return { ok: true, instruction: { kind: 'duty', seed } }
  }

  if (parts[0] === 'CASE001' || parts[0] === 'STORY') {
    if (parts[1] === 'RESET' || parts[1] === 'START') {
      const seed = parsePositiveSeed(parts[2])
      if (parts[2] && !seed) return { ok: false, message: 'Story seed 必须是正整数。' }
      return { ok: true, instruction: { kind: 'story-reset', seed } }
    }
    const target = TARGET_ALIASES[parts[1] ?? '']
    if (!target) return { ok: false, message: 'Story 跳转支持 ERRORS / OVERFIT / REPAIR / FINAL / CLOSED。' }
    const seed = parsePositiveSeed(parts[2])
    if (parts[2] && !seed) return { ok: false, message: 'Story seed 必须是正整数。' }
    return { ok: true, instruction: { kind: 'story', target, seed } }
  }

  return { ok: false, message: '未知作弊码。输入 HELP 查看可用命令。' }
}

type StoryBuilder = {
  state: GameState
  experimentLog: ExperimentRecord[]
  selectedMistake?: string
  observationAnswer?: string
  suspectSampleId?: string
  sensorReads: FeatureKey[]
  repairSensorReads: FeatureKey[]
  modelConfirmed: boolean
  boundaryProbeAnswer?: string
  successPrediction?: string
  evidenceInference?: string
  suspiciousAttemptId?: number
  overfitReflection?: string
  finalReflection?: string
  pendingPrediction?: ExperimentPrediction
}

function storySessionFrom(builder: StoryBuilder, seed: number): StorySessionData {
  return {
    version: STORY_SESSION_VERSION,
    seed,
    state: builder.state,
    entryPhase: 'game',
    selectedMistake: builder.selectedMistake,
    observationAnswer: builder.observationAnswer,
    suspectSampleId: builder.suspectSampleId,
    sensorReads: builder.sensorReads,
    repairSensorReads: builder.repairSensorReads,
    modelConfirmed: builder.modelConfirmed,
    boundaryProbeAnswer: builder.boundaryProbeAnswer,
    successPrediction: builder.successPrediction,
    evidenceInference: builder.evidenceInference,
    suspiciousAttemptId: builder.suspiciousAttemptId,
    overfitReflection: builder.overfitReflection,
    finalReflection: builder.finalReflection,
    experimentLog: builder.experimentLog,
    pendingPrediction: builder.pendingPrediction,
    emergencyAudits: 0,
    reasoningMisses: 0,
  }
}

export function createStoryCheatSession(target: StoryCheatTarget, seed = 20260809): StorySessionData {
  const service = createAuditService(seed)
  let state = createInitialGameState(seed, 0)
  const experimentLog: ExperimentRecord[] = []
  const builder: StoryBuilder = {
    state,
    experimentLog,
    sensorReads: [],
    repairSensorReads: [],
    modelConfirmed: false,
  }

  const dispatch = (action: GameAction) => {
    state = gameReducer(state, action)
    builder.state = state
  }
  const train = () => {
    const points = projectSamples(service.train, state.selectedFeatures)
    const fitted = MODEL_REGISTRY[state.selectedModel].fit(points)
    const metrics = evaluate(fitted, points)
    dispatch({
      type: 'TRAIN_RESULT',
      result: {
        accuracy: metrics.accuracy,
        errorCount: metrics.errorCount,
        complexity: fitted.complexity,
      },
    })
  }
  const audit = (prediction?: ExperimentPrediction) => {
    const points = projectSamples(service.train, state.selectedFeatures)
    const fitted = MODEL_REGISTRY[state.selectedModel].fit(points)
    const result = service.audit(fitted, state.selectedFeatures)
    const trainAccuracy = state.training?.accuracy ?? evaluate(fitted, points).accuracy
    const previous = experimentLog.at(-1)
    experimentLog.push({
      id: experimentLog.length + 1,
      model: state.selectedModel,
      features: [...state.selectedFeatures],
      trainAccuracy,
      auditAccuracy: result.accuracy,
      errors: result.errorCount,
      prediction: previous ? prediction : undefined,
      predictionMatched: previous ? predictionMatches(prediction, trainAccuracy, result.accuracy, previous) : undefined,
    })
    dispatch({ type: 'AUDIT_RESULT', result })
  }

  // Reconstruct the canonical newcomer path using the same reducer/model/audit code as play.
  dispatch({ type: 'START' })
  builder.observationAnswer = 'clusters'
  builder.suspectSampleId = 'train-cat-16'
  dispatch({ type: 'OBSERVE_DONE' })
  builder.sensorReads = ['warmth', 'roundness']
  dispatch({ type: 'ADVANCE' })
  builder.modelConfirmed = true
  dispatch({ type: 'ADVANCE' })
  train()

  const firstModel = MODEL_REGISTRY[state.selectedModel].fit(projectSamples(service.train, state.selectedFeatures))
  const probe = service.publicTest[12]
  builder.boundaryProbeAnswer = firstModel.predict({
    x: probe.features[state.selectedFeatures[0]],
    y: probe.features[state.selectedFeatures[1]],
  })
  builder.successPrediction = 'need-new'
  dispatch({ type: 'ADVANCE' })
  audit()
  builder.selectedMistake = state.audit?.mistakes[0]?.id

  if (target === 'errors') return storySessionFrom(builder, seed)

  const firstTwoMistakes = state.audit?.mistakes.slice(0, 2) ?? []
  for (const mistake of firstTwoMistakes) dispatch({ type: 'VIEW_MISTAKE', id: mistake.id })
  builder.evidenceInference = 'feature-gap'
  dispatch({ type: 'ADVANCE' })
  builder.selectedMistake = undefined

  dispatch({ type: 'SET_MODEL', model: 'knn-1' })
  builder.pendingPrediction = 'train-up-test-down'
  train()
  audit(builder.pendingPrediction)
  builder.pendingPrediction = undefined

  if (target === 'overfit') return storySessionFrom(builder, seed)

  builder.suspiciousAttemptId = experimentLog.at(-1)?.id
  builder.overfitReflection = 'memorized'
  dispatch({ type: 'ADVANCE' })
  builder.repairSensorReads = ['texture', 'aspect']

  if (target === 'repair') return storySessionFrom(builder, seed)

  dispatch({ type: 'SET_FEATURES', features: ['texture', 'aspect'] })
  dispatch({ type: 'SET_MODEL', model: 'linear' })
  builder.pendingPrediction = 'test-improves'
  train()
  audit(builder.pendingPrediction)
  builder.pendingPrediction = undefined

  if (target === 'final') return storySessionFrom(builder, seed)

  builder.finalReflection = 'unknown-stable'
  dispatch({ type: 'ADVANCE' })
  const correctTransfer = TRANSFER_QUESTION.options.find((option) => option.correct)
  if (!correctTransfer) throw new Error('Missing correct transfer option')
  dispatch({ type: 'ANSWER_TRANSFER', id: correctTransfer.id, correct: true })
  dispatch({ type: 'ADVANCE' })

  return storySessionFrom(builder, seed)
}
