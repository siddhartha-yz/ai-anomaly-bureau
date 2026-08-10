import { createEndlessCasePreview, type EndlessCasePreview } from '../endless/generator'
import { clearEndlessSession, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits } from '../endless/session'

export type DutyCasePreview = EndlessCasePreview

export type DutyResumeSummary = {
  seed: number
  historyCount: number
  remainingCredits: number
  solved: boolean
}

export function createDutyCasePreview(seed: number): DutyCasePreview {
  return createEndlessCasePreview(seed)
}

export function readDutyResume(storage: Storage, seed: number): DutyResumeSummary | undefined {
  const saved = readEndlessSession(storage, seed)
  if (!saved || !hasEndlessSessionProgress(saved)) return undefined
  return {
    seed: saved.seed,
    historyCount: saved.history.length,
    remainingCredits: remainingEndlessAuditCredits(saved),
    solved: saved.solved,
  }
}

export function clearDutyProgress(storage: Storage, seed: number) {
  clearEndlessSession(storage, seed)
}
