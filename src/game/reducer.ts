import { INITIAL_FEATURES, LEVEL_META } from '../content/level1'
import type { GameAction, GameState, Stage } from './types'

export function createInitialGameState(seed = 20260809, now = Date.now()): GameState {
  return {
    seed,
    stage: 'briefing',
    selectedFeatures: [...INITIAL_FEATURES],
    selectedModel: 'linear',
    auditHistory: [],
    viewedMistakes: [],
    attempts: 0,
    retryCount: 0,
    failureStreak: 0,
    hintLevel: 0,
    hasSeenOverfit: false,
    startedAt: now,
    diagnostics: [],
  }
}

function diagnostic(state: GameState, message: string): GameState {
  return { ...state, diagnostics: [...state.diagnostics, `${state.stage}: ${message}`] }
}

function nextHintLevel(state: GameState): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, state.hintLevel + 1)) as 1 | 2 | 3
}

function resetResultState(state: GameState): GameState {
  return { ...state, training: undefined, audit: undefined, viewedMistakes: [] }
}

export function isFinalAuditPass(state: GameState): boolean {
  return Boolean(
    state.audit &&
      state.audit.accuracy >= LEVEL_META.successTestAccuracy &&
      state.audit.orangeCatErrors <= LEVEL_META.maxOrangeCatErrors,
  )
}

function canAdvance(state: GameState): boolean {
  if (state.stage === 'choose_features') return state.selectedFeatures.length === 2
  if (state.stage === 'choose_model') return Boolean(state.selectedModel)
  if (state.stage === 'inspect_errors') return state.viewedMistakes.length >= 2
  if (state.stage === 'final_audit') return isFinalAuditPass(state)
  if (state.stage === 'transfer_question') return state.transferCorrect === true
  return true
}

function advanceStage(state: GameState): Stage | undefined {
  switch (state.stage) {
    case 'briefing': return 'inspect_data'
    case 'inspect_data': return 'choose_features'
    case 'choose_features': return 'choose_model'
    case 'choose_model': return 'train'
    case 'first_success': return 'hidden_test'
    case 'inspect_errors': return 'iterate'
    case 'overfit_reveal': return 'iterate'
    case 'final_audit': return 'transfer_question'
    case 'transfer_question': return 'complete'
    default: return undefined
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START':
      if (state.stage !== 'briefing') return diagnostic(state, 'START ignored outside briefing')
      return { ...state, stage: 'inspect_data' }

    case 'OBSERVE_DONE':
      if (state.stage !== 'inspect_data') return diagnostic(state, 'OBSERVE_DONE ignored')
      return { ...state, stage: 'choose_features' }

    case 'SET_FEATURES': {
      if (new Set(action.features).size !== 2) return diagnostic(state, 'duplicate features rejected')
      return resetResultState({ ...state, selectedFeatures: action.features })
    }

    case 'SET_MODEL':
      return resetResultState({ ...state, selectedModel: action.model })

    case 'ADVANCE': {
      if (!canAdvance(state)) return diagnostic(state, 'advance guard blocked')
      const next = advanceStage(state)
      if (!next) return diagnostic(state, 'no ADVANCE transition')
      if (next === 'complete') return { ...state, stage: next, completedAt: Date.now() }
      if (state.stage === 'inspect_errors') return { ...state, stage: next, viewedMistakes: [] }
      return { ...state, stage: next }
    }

    case 'TRAIN_RESULT': {
      const attempts = state.attempts + 1
      if (state.stage === 'train') {
        const success = action.result.accuracy >= 0.8
        return {
          ...state,
          training: action.result,
          attempts,
          retryCount: success ? state.retryCount : state.retryCount + 1,
          failureStreak: success ? 0 : state.failureStreak + 1,
          hintLevel: success ? state.hintLevel : nextHintLevel(state),
          stage: success ? 'first_success' : 'train',
        }
      }
      if (state.stage === 'iterate') {
        return { ...state, training: action.result, audit: undefined, attempts }
      }
      return diagnostic(state, 'training ignored in current stage')
    }

    case 'AUDIT_RESULT': {
      if (!state.training) return diagnostic(state, 'audit rejected before training')
      const history = [...state.auditHistory, action.result]
      const passed =
        action.result.accuracy >= LEVEL_META.successTestAccuracy &&
        action.result.orangeCatErrors <= LEVEL_META.maxOrangeCatErrors

      if (state.stage === 'hidden_test') {
        return {
          ...state,
          audit: action.result,
          auditHistory: history,
          stage: action.result.errorCount > 0 ? 'inspect_errors' : 'iterate',
          failureStreak: action.result.errorCount > 0 ? 1 : 0,
          hintLevel: action.result.errorCount > 0 ? Math.max(1, state.hintLevel) as 1 | 2 | 3 : state.hintLevel,
        }
      }

      if (state.stage !== 'iterate') return diagnostic(state, 'audit ignored in current stage')

      const overfitObserved =
        state.selectedModel === 'knn-1' &&
        state.training.accuracy >= 0.98 &&
        action.result.accuracy < state.training.accuracy - 0.08

      if (!state.hasSeenOverfit && overfitObserved) {
        return {
          ...state,
          audit: action.result,
          auditHistory: history,
          stage: 'overfit_reveal',
          hasSeenOverfit: true,
          failureStreak: 0,
        }
      }

      if (state.hasSeenOverfit && passed) {
        return {
          ...state,
          audit: action.result,
          auditHistory: history,
          stage: 'final_audit',
          failureStreak: 0,
        }
      }

      const failureStreak = state.failureStreak + 1
      return {
        ...state,
        audit: action.result,
        auditHistory: history,
        retryCount: state.retryCount + 1,
        failureStreak,
        hintLevel: Math.min(3, Math.max(state.hintLevel, failureStreak)) as 0 | 1 | 2 | 3,
      }
    }

    case 'VIEW_MISTAKE':
      if (state.stage !== 'inspect_errors') {
        return diagnostic(state, 'mistake investigation ignored outside inspect_errors')
      }
      if (!state.audit?.mistakes.some((mistake) => mistake.id === action.id)) {
        return diagnostic(state, `unknown mistake ${action.id}`)
      }
      return state.viewedMistakes.includes(action.id)
        ? state
        : { ...state, viewedMistakes: [...state.viewedMistakes, action.id] }

    case 'REQUEST_HINT':
      return { ...state, hintLevel: nextHintLevel(state) }

    case 'ANSWER_TRANSFER':
      if (state.stage !== 'transfer_question') return diagnostic(state, 'transfer answer ignored')
      return { ...state, transferAnswer: action.id, transferCorrect: action.correct }
  }
}
