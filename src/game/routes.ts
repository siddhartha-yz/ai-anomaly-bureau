import { TRANSFER_QUESTION } from '../content/level1'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import { createAuditService } from './audit'
import { createInitialGameState, gameReducer } from './reducer'
import type { GameAction, GameState } from './types'

export type PersonaId =
  | 'random-clicker'
  | 'accuracy-worshipper'
  | 'complexity-worshipper'
  | 'hint-dependent'
  | 'conservative'
  | 'correct-understanding'

export const PERSONAS: Record<PersonaId, { label: string; description: string }> = {
  'random-clicker': { label: '乱点型', description: '快速点击、尝试越过守卫，再回到可行路线。' },
  'accuracy-worshipper': { label: '准确率崇拜型', description: '优先追求训练集满分，直到测试失败迫使其改变。' },
  'complexity-worshipper': { label: '复杂模型崇拜型', description: '反复选择 k=1，再比较更平滑方案。' },
  'hint-dependent': { label: '提示依赖型', description: '在关键阶段主动请求提示后行动。' },
  conservative: { label: '保守型', description: '第一次成功后不愿修改，审计失败后才调整。' },
  'correct-understanding': { label: '正确理解型', description: '检查错误、经历过拟合，再用稳健特征修复。' },
}

export type RouteResult = {
  persona: PersonaId
  finalState: GameState
  actions: string[]
}

export function runPersonaRoute(persona: PersonaId, seed = 20260809): RouteResult {
  const service = createAuditService(seed)
  let state = createInitialGameState(seed, true, 0)
  const actions: string[] = []

  const dispatch = (action: GameAction) => {
    actions.push(action.type)
    state = gameReducer(state, action)
  }

  const setFeatures = (features: [FeatureKey, FeatureKey]) => dispatch({ type: 'SET_FEATURES', features })
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
        params: fitted.describe(),
      },
    })
  }
  const audit = () => {
    const points = projectSamples(service.train, state.selectedFeatures)
    const fitted = MODEL_REGISTRY[state.selectedModel].fit(points)
    dispatch({ type: 'AUDIT_RESULT', result: service.audit(fitted, state.selectedFeatures) })
  }

  if (persona === 'random-clicker') {
    dispatch({ type: 'ADVANCE' })
    dispatch({ type: 'AUDIT_RESULT', result: { accuracy: 0, errorCount: 0, mistakes: [], orangeCatErrors: 0, confusion: { 'cat->cat': 0, 'cat->bread': 0, 'bread->cat': 0, 'bread->bread': 0 } } })
  }

  dispatch({ type: 'START' })
  if (persona === 'hint-dependent') dispatch({ type: 'REQUEST_HINT' })
  dispatch({ type: 'OBSERVE_DONE' })
  dispatch({ type: 'ADVANCE' })
  dispatch({ type: 'ADVANCE' })
  train()

  if (persona === 'conservative') dispatch({ type: 'REQUEST_HINT' })
  dispatch({ type: 'ADVANCE' })
  audit()
  const firstMistake = state.audit?.mistakes[0]
  const secondMistake = state.audit?.mistakes[1]
  if (firstMistake) dispatch({ type: 'VIEW_MISTAKE', id: firstMistake.id })
  if (secondMistake) dispatch({ type: 'VIEW_MISTAKE', id: secondMistake.id })
  if (persona === 'hint-dependent') dispatch({ type: 'REQUEST_HINT' })
  dispatch({ type: 'ADVANCE' })

  // Required phenomenon before naming overfitting: a memorizing 1-NN scores 100%
  // on training data and then loses ground on unseen samples.
  dispatch({ type: 'SET_MODEL', model: 'knn-1' })
  if (persona === 'correct-understanding') setFeatures(['texture', 'aspect'])
  train()
  audit()

  if (state.stage === 'overfit_reveal') dispatch({ type: 'ADVANCE' })

  if (persona === 'accuracy-worshipper' || persona === 'complexity-worshipper') {
    dispatch({ type: 'SET_MODEL', model: 'knn-1' })
    train()
    audit()
  }

  if (persona === 'hint-dependent') dispatch({ type: 'REQUEST_HINT' })
  setFeatures(['texture', 'aspect'])
  dispatch({ type: 'SET_MODEL', model: persona === 'complexity-worshipper' ? 'knn-5' : 'linear' })
  train()
  audit()

  if (state.stage !== 'final_audit') {
    // Deterministic recovery path for error personas; keeps the route finite while
    // preserving their earlier bad choices in the action trace.
    setFeatures(['texture', 'aspect'])
    dispatch({ type: 'SET_MODEL', model: 'knn-5' })
    train()
    audit()
  }

  if (state.stage === 'final_audit') dispatch({ type: 'ADVANCE' })
  if (state.stage === 'transfer_question') {
    const correct = TRANSFER_QUESTION.options.find((option) => option.correct)!
    dispatch({ type: 'ANSWER_TRANSFER', id: correct.id, correct: true })
    dispatch({ type: 'ADVANCE' })
  }

  return { persona, finalState: state, actions }
}
