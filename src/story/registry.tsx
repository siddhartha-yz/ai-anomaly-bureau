import type { ComponentType } from 'react'
import { STORY_CASE_001, type FormalCaseDefinition, type FormalCaseId } from '../bureau/catalog'
import { isFormalCaseResolved, recordFormalCaseResolution, type BureauProgress, type InvestigationGrade } from '../bureau/progress'
import { calculateCaseScore } from '../components/CaseRating'
import { STAGE_CONTENT } from '../content/level1'
import { clearStorySession, readStorySession, storyAuditCredits, storySessionHasProgress, type StorageLike } from '../game/session'
import { StoryCase001Runtime } from './StoryCase001Runtime'

export type FormalCaseResumeSummary = {
  stageLabel: string
  experimentCount: number
  remainingCredits: number
  solved: boolean
}

export type FormalCaseRuntimeProps = {
  seed: number
  onRestart: () => void
  onReturnToBureau?: () => void
  onCaseClosed?: (result: { grade: InvestigationGrade; score: number }) => void
}

export type FormalCaseRuntimeDefinition = {
  definition: FormalCaseDefinition
  Component: ComponentType<FormalCaseRuntimeProps>
  readResume: (storage: StorageLike, seed: number) => FormalCaseResumeSummary | undefined
  clearSession: (storage: StorageLike, seed: number) => void
  reconcileProgress: (storage: StorageLike, seed: number, progress: BureauProgress) => BureauProgress
}

const CASE_001_RUNTIME: FormalCaseRuntimeDefinition = {
  definition: STORY_CASE_001,
  Component: StoryCase001Runtime,
  readResume(storage, seed) {
    const saved = readStorySession(storage, seed)
    if (!saved || !storySessionHasProgress(saved)) return undefined
    return {
      stageLabel: STAGE_CONTENT[saved.state.stage].step,
      experimentCount: saved.experimentLog.length,
      remainingCredits: storyAuditCredits(saved),
      solved: saved.state.stage === 'complete',
    }
  },
  clearSession(storage, seed) {
    clearStorySession(storage, seed)
  },
  reconcileProgress(storage, seed, progress) {
    const saved = readStorySession(storage, seed)
    if (!saved || saved.state.stage !== 'complete' || isFormalCaseResolved(progress, STORY_CASE_001.id)) return progress
    const predictionHits = saved.experimentLog.filter((record) => record.predictionMatched === true).length
    const predictionMisses = saved.experimentLog.filter((record) => record.predictionMatched === false).length
    const rating = calculateCaseScore({
      experimentCount: saved.experimentLog.length,
      emergencyAudits: saved.emergencyAudits,
      hintLevel: saved.state.hintLevel,
      predictionHits,
      predictionMisses,
      trustedOldScore: saved.successPrediction === 'fixed',
      reasoningMisses: saved.reasoningMisses,
    })
    return recordFormalCaseResolution(progress, STORY_CASE_001.id, rating.grade, rating.score)
  },
}

export const FORMAL_CASE_RUNTIME_REGISTRY = {
  [STORY_CASE_001.id]: CASE_001_RUNTIME,
} satisfies Record<FormalCaseId, FormalCaseRuntimeDefinition>

export function formalCaseRuntime(id: FormalCaseId): FormalCaseRuntimeDefinition {
  return FORMAL_CASE_RUNTIME_REGISTRY[id]
}

export function readFormalCaseResumes(storage: StorageLike, seed: number): Partial<Record<FormalCaseId, FormalCaseResumeSummary>> {
  const summaries: Partial<Record<FormalCaseId, FormalCaseResumeSummary>> = {}
  for (const id of Object.keys(FORMAL_CASE_RUNTIME_REGISTRY) as FormalCaseId[]) {
    const summary = FORMAL_CASE_RUNTIME_REGISTRY[id].readResume(storage, seed)
    if (summary) summaries[id] = summary
  }
  return summaries
}
