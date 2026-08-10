import type { ComponentType } from 'react'
import { TRAINING_CASE_000, type TrainingCaseDefinition, type TrainingCaseId } from '../bureau/catalog'
import { TrainingCase000Runtime } from './TrainingCase000Runtime'

export type TrainingCaseRuntimeProps = {
  onComplete: () => void
  onBack: () => void
}

export type TrainingCaseRuntimeDefinition = {
  definition: TrainingCaseDefinition
  Component: ComponentType<TrainingCaseRuntimeProps>
}

const TRAINING_000_RUNTIME: TrainingCaseRuntimeDefinition = {
  definition: TRAINING_CASE_000,
  Component: TrainingCase000Runtime,
}

export const TRAINING_CASE_RUNTIME_REGISTRY = {
  [TRAINING_CASE_000.id]: TRAINING_000_RUNTIME,
} satisfies Record<TrainingCaseId, TrainingCaseRuntimeDefinition>

export function trainingCaseRuntime(id: TrainingCaseId): TrainingCaseRuntimeDefinition {
  return TRAINING_CASE_RUNTIME_REGISTRY[id]
}
