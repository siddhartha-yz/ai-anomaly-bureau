import type { Evaluation, FeatureKey, Prediction } from '../ml/types'
import type { ModelId } from '../ml/registry'

export type Stage =
  | 'briefing'
  | 'inspect_data'
  | 'choose_features'
  | 'choose_model'
  | 'train'
  | 'first_success'
  | 'hidden_test'
  | 'inspect_errors'
  | 'iterate'
  | 'overfit_reveal'
  | 'final_audit'
  | 'transfer_question'
  | 'complete'

export type MistakeDetail = Prediction & {
  features: Record<FeatureKey, number>
  flags?: {
    orangeCat?: boolean
    roundBread?: boolean
    auditProbe?: boolean
  }
}

export type AuditResult = {
  accuracy: number
  errorCount: number
  confusion: Evaluation['confusion']
  mistakes: MistakeDetail[]
  orangeCatErrors: number
}

export type TrainingResult = {
  accuracy: number
  errorCount: number
  complexity: number
  params?: Record<string, number | string | boolean>
}

export type GameState = {
  seed: number
  debug: boolean
  stage: Stage
  selectedFeatures: [FeatureKey, FeatureKey]
  selectedModel: ModelId
  training?: TrainingResult
  audit?: AuditResult
  auditHistory: AuditResult[]
  viewedMistakes: string[]
  attempts: number
  retryCount: number
  failureStreak: number
  hintLevel: 0 | 1 | 2 | 3
  hasSeenOverfit: boolean
  transferAnswer?: string
  transferCorrect?: boolean
  startedAt: number
  completedAt?: number
  diagnostics: string[]
}

export type GameAction =
  | { type: 'START' }
  | { type: 'OBSERVE_DONE' }
  | { type: 'SET_FEATURES'; features: [FeatureKey, FeatureKey] }
  | { type: 'SET_MODEL'; model: ModelId }
  | { type: 'ADVANCE' }
  | { type: 'TRAIN_RESULT'; result: TrainingResult }
  | { type: 'AUDIT_RESULT'; result: AuditResult }
  | { type: 'VIEW_MISTAKE'; id: string }
  | { type: 'REQUEST_HINT' }
  | { type: 'ANSWER_TRANSFER'; id: string; correct: boolean }
  | { type: 'DEBUG_JUMP'; stage: Stage }
  | { type: 'DEBUG_RESET_STAGE' }
  | { type: 'DEBUG_LOAD_STATE'; state: GameState }
