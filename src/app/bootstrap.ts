import { FORMAL_CASE_CATALOG, STORY_CASE_001 } from '../bureau/catalog'
import { readBureauProgress, reconcileLegacyProgress, writeBureauProgress, type BureauProgress } from '../bureau/progress'
import { formalCaseRuntime } from '../story/registry'

const LEGACY_BOOT_COMPLETION_KEY = 'aia.boot-case-000.v2'

function readLegacyBootCompletion(storage: Pick<Storage, 'getItem'>) {
  try {
    return storage.getItem(LEGACY_BOOT_COMPLETION_KEY) === 'complete'
  } catch {
    return false
  }
}

export function bootstrapBureauProgress(storage: Storage, seed: number): BureauProgress {
  const inductionRuntime = formalCaseRuntime(STORY_CASE_001.id)
  const legacyBootCompleted = readLegacyBootCompletion(storage)
  let progress = readBureauProgress(storage)
  for (const definition of FORMAL_CASE_CATALOG) {
    progress = formalCaseRuntime(definition.id).reconcileProgress(storage, seed, progress)
  }
  progress = reconcileLegacyProgress(progress, {
    storyResolved: Boolean(inductionRuntime.readResume(storage, seed)?.solved),
    bootCompleted: legacyBootCompleted,
  })
  const saved = writeBureauProgress(storage, progress)
  if (saved && legacyBootCompleted) {
    try { storage.removeItem(LEGACY_BOOT_COMPLETION_KEY) } catch { /* v2 is already durable */ }
  }
  return progress
}
