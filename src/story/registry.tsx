import type { ComponentType } from 'react'
import { STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, type FormalCaseDefinition, type FormalCaseId } from '../bureau/catalog'
import { isFormalCaseResolved, recordFormalCaseResolution, type BureauProgress, type InvestigationGrade } from '../bureau/progress'
import { calculateCaseScore } from '../components/CaseRating'
import { STAGE_CONTENT } from '../content/level1'
import { clearStorySession, readStorySession, storyAuditCredits, storySessionHasProgress, type StorageLike } from '../game/session'
import { AUTHORED_PUZZLE_CASES, type AuthoredPuzzleConfig } from './authoredCasePuzzles'
import { StoryCase001Runtime } from './StoryCase001Runtime'
import { puzzleCaseScore, StoryPuzzleRuntime } from './StoryPuzzleRuntime'
import { clearPuzzleSession, puzzleSessionHasProgress, readPuzzleSession } from './puzzleSession'

export type FormalCaseResumeSummary = {
  stageLabel: string
  experimentCount: number
  remainingCredits: number
  solved: boolean
  activityLabel?: string
  resourceLabel?: string
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

function createPuzzleRuntime(config: AuthoredPuzzleConfig): FormalCaseRuntimeDefinition {
  const caseId = config.definition.id as FormalCaseId
  return {
    definition: config.definition,
    Component: (props) => <StoryPuzzleRuntime config={config} {...props} />,
    readResume(storage, seed) {
      const saved = readPuzzleSession(storage, config, seed)
      if (!saved || !puzzleSessionHasProgress(saved)) return undefined
      return {
        stageLabel: saved.solved ? '调查完成' : config.stages[saved.stage].title,
        experimentCount: saved.checks,
        remainingCredits: saved.mistakes,
        solved: saved.solved,
        activityLabel: 'CHECKS',
        resourceLabel: 'REVISIONS',
      }
    },
    clearSession(storage, seed) {
      clearPuzzleSession(storage, caseId, seed)
    },
    reconcileProgress(storage, seed, progress) {
      const saved = readPuzzleSession(storage, config, seed)
      if (!saved?.solved || isFormalCaseResolved(progress, caseId)) return progress
      const rating = puzzleCaseScore(saved.mistakes)
      return recordFormalCaseResolution(progress, caseId, rating.grade, rating.score)
    },
  }
}

const CASE_002_RUNTIME = createPuzzleRuntime(AUTHORED_PUZZLE_CASES[STORY_CASE_002.id])
const CASE_003_RUNTIME = createPuzzleRuntime(AUTHORED_PUZZLE_CASES[STORY_CASE_003.id])
const CASE_004_RUNTIME = createPuzzleRuntime(AUTHORED_PUZZLE_CASES[STORY_CASE_004.id])

export const FORMAL_CASE_RUNTIME_REGISTRY = {
  [STORY_CASE_001.id]: CASE_001_RUNTIME,
  [STORY_CASE_002.id]: CASE_002_RUNTIME,
  [STORY_CASE_003.id]: CASE_003_RUNTIME,
  [STORY_CASE_004.id]: CASE_004_RUNTIME,
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
