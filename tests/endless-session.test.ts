import { describe, expect, it } from 'vitest'
import { evaluate } from '../src/ml/evaluate'
import { projectSamples } from '../src/ml/features'
import { MODEL_REGISTRY } from '../src/ml/registry'
import { createEndlessCase, enumerateEndlessSolutions } from '../src/endless/generator'
import { accuracyBand, experimentDelta } from '../src/endless/uiTypes'
import { ENDLESS_SESSION_VERSION, endlessSessionKey, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits, writeEndlessSession, type EndlessSessionData, type StorageLike } from '../src/endless/session'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function session(seed = 6000): EndlessSessionData {
  const caseData = createEndlessCase(seed)
  const model = caseData.baseline.model
  const features = [...caseData.baseline.features] as EndlessSessionData['features']
  const trainPoints = projectSamples(caseData.train, features)
  const train = evaluate(MODEL_REGISTRY[model].fit(trainPoints), trainPoints).accuracy
  const audit = caseData.audit(model, features)
  const firstMistake = audit.mistakes[0]
  return {
    version: ENDLESS_SESSION_VERSION,
    seed,
    features,
    activeSlot: 1,
    model,
    trained: true,
    auditComplete: true,
    emergencyCredits: 0,
    history: [{
      id: 1,
      model,
      features,
      train,
      test: audit.accuracy,
      errors: audit.errorCount,
      prediction: accuracyBand(audit.accuracy),
      predictionHit: true,
      recall: audit.recall,
      reliable: caseData.isReliable(audit),
    }],
    diagnosisAttempts: 0,
    lastDiagnosisConfigCount: 0,
    lastDiagnosisRunCount: 0,
    selectedEvidenceRunIds: [],
    inspectedArchiveIds: [],
    inspectedCaseLeadIds: [],
    inspectedFieldErrors: firstMistake
      ? [{ runId: 1, sampleId: firstMistake.id, actual: firstMistake.actual, predicted: firstMistake.predicted }]
      : [],
    solved: false,
  }
}

describe('endless local session persistence', () => {
  it('round-trips only the versioned player-visible investigation state', () => {
    const storage = new MemoryStorage()
    const value = session()
    expect(writeEndlessSession(storage, value)).toBe(true)
    expect(readEndlessSession(storage, 6000)).toEqual(value)
    const raw = storage.getItem(endlessSessionKey(6000)) ?? ''
    if (value.inspectedFieldErrors[0]) expect(raw).toContain(value.inspectedFieldErrors[0].sampleId)
    expect(raw).not.toMatch(/test-cat|test-bread|syndrome|diagnosis\.correct/)
  })

  it('persists a pre-audit causal expectation and rejects unknown expectation values', () => {
    const storage = new MemoryStorage()
    const value = { ...session(), causalPrediction: 'improved' as const }
    expect(writeEndlessSession(storage, value)).toBe(true)
    expect(readEndlessSession(storage, 6000)?.causalPrediction).toBe('improved')

    const degraded = { ...session(), causalPrediction: 'degraded' as const }
    expect(writeEndlessSession(storage, degraded)).toBe(true)
    expect(readEndlessSession(storage, 6000)?.causalPrediction).toBe('degraded')

    // Compatibility for a preregistration saved by the earlier v6 UI.
    const legacyMaterial = { ...session(), causalPrediction: 'material' as const }
    expect(writeEndlessSession(storage, legacyMaterial)).toBe(true)
    expect(readEndlessSession(storage, 6000)?.causalPrediction).toBe('material')

    storage.setItem(endlessSessionKey(6000), JSON.stringify({ ...value, causalPrediction: 'after-the-fact' }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('persists source forecasts without invalidating older v6 sessions', () => {
    const storage = new MemoryStorage()
    const value = { ...session(), caseLeadPredictions: { composition: 'signal' as const, batch: 'clear' as const } }
    expect(writeEndlessSession(storage, value)).toBe(true)
    expect(readEndlessSession(storage, 6000)?.caseLeadPredictions).toEqual(value.caseLeadPredictions)

    storage.setItem(endlessSessionKey(6000), JSON.stringify({ ...value, caseLeadPredictions: { quality: 'maybe' } }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const legacyCompatible = session()
    storage.setItem(endlessSessionKey(6000), JSON.stringify(legacyCompatible))
    expect(readEndlessSession(storage, 6000)?.caseLeadPredictions).toBeUndefined()
  })

  it('isolates progress by seed', () => {
    const storage = new MemoryStorage()
    writeEndlessSession(storage, session(6000))
    expect(readEndlessSession(storage, 6001)).toBeUndefined()
    expect(readEndlessSession(storage, 6000)?.history).toHaveLength(1)
  })

  it('drops malformed or incompatible session payloads instead of crashing the game', () => {
    const storage = new MemoryStorage()
    storage.setItem(endlessSessionKey(6000), '{not-json')
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(endlessSessionKey(6000))).toBeNull()

    storage.setItem(endlessSessionKey(6000), JSON.stringify({ ...session(), version: 99 }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(endlessSessionKey(6000))).toBeNull()
  })

  it('discards legacy v1 Duty history after the generated field semantics changed', () => {
    const storage = new MemoryStorage()
    const legacyKey = 'aia.endless-session.v1.6000'
    storage.setItem(legacyKey, JSON.stringify({ ...session(), version: 1 }))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
    expect(storage.getItem(legacyKey)).toBeNull()
  })

  it('migrates v5 Duty history but reopens H-COVERAGE after its semantics changed in v6', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v5.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['composition'] as const }
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 5 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('migrates v4 Duty history but reopens causal-source folders whose semantics changed by v6', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v4.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['batch'] as const }
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 4 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
    expect(storage.getItem(endlessSessionKey(6001))).not.toBeNull()
  })

  it('keeps the v3 source intact when canonical v6 migration cannot be written', () => {
    const backing = new MemoryStorage()
    const previousKey = 'aia.endless-session.v3.6001'
    const previous = { ...session(6001), inspectedCaseLeadIds: ['batch'] as const }
    backing.setItem(previousKey, JSON.stringify({ ...previous, version: 3 }))
    const storage: StorageLike = {
      getItem: (key) => backing.getItem(key),
      removeItem: (key) => backing.removeItem(key),
      setItem: (key, value) => {
        if (key === endlessSessionKey(6001)) throw new DOMException('quota', 'QuotaExceededError')
        backing.setItem(key, value)
      },
    }
    expect(readEndlessSession(storage, 6001)).toBeUndefined()
    expect(backing.getItem(previousKey)).not.toBeNull()
    expect(backing.getItem(endlessSessionKey(6001))).toBeNull()
  })

  it('still migrates v2 non-shift history directly into v6 with unopened causal sources', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v2.6001'
    const { inspectedCaseLeadIds: _newField, ...previous } = session(6001)
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 2 }))
    const migrated = readEndlessSession(storage, 6001)
    expect(migrated?.version).toBe(6)
    expect(migrated?.history).toHaveLength(1)
    expect(migrated?.inspectedCaseLeadIds).toEqual([])
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('still drops v2 distribution-shift history because v3 changed that field world', () => {
    const storage = new MemoryStorage()
    const previousKey = 'aia.endless-session.v2.6002'
    const { inspectedCaseLeadIds: _newField, ...previous } = session(6002)
    storage.setItem(previousKey, JSON.stringify({ ...previous, version: 2 }))
    expect(readEndlessSession(storage, 6002)).toBeUndefined()
    expect(storage.getItem(previousKey)).toBeNull()
  })

  it('rejects a forged run with impossible metric ranges', () => {
    const storage = new MemoryStorage()
    const invalid = session()
    invalid.history[0].test = 5
    storage.setItem(endlessSessionKey(6000), JSON.stringify(invalid))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('rejects plausible-looking metrics or inspected mistakes that do not belong to the generated seed', () => {
    const storage = new MemoryStorage()
    const forgedMetric = session()
    forgedMetric.history[0].test = Math.max(0, forgedMetric.history[0].test - .01)
    forgedMetric.history[0].errors = Math.max(0, forgedMetric.history[0].errors - 1)
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedMetric))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const forgedPrediction = session()
    forgedPrediction.history[0].predictionHit = !forgedPrediction.history[0].predictionHit
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedPrediction))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const forgedInspection = session()
    if (forgedInspection.inspectedFieldErrors[0]) {
      forgedInspection.inspectedFieldErrors[0].actual = forgedInspection.inspectedFieldErrors[0].actual === 'cat' ? 'bread' : 'cat'
      storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedInspection))
      expect(readEndlessSession(storage, 6000)).toBeUndefined()
    }
  })

  it('rejects contradictory diagnosis and solved-state relationships', () => {
    const storage = new MemoryStorage()

    const impossibleAttempt = session()
    impossibleAttempt.diagnosisAttempts = 1
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleAttempt))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const forgedSolved = session()
    forgedSolved.solved = true
    forgedSolved.diagnosis = 'feature-gap'
    forgedSolved.submittedDiagnosis = 'feature-gap'
    forgedSolved.diagnosisAttempts = 1
    forgedSolved.selectedEvidenceRunIds = [1]
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedSolved))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleOutcome = session()
    impossibleOutcome.solved = true
    impossibleOutcome.diagnosisAttempts = 1
    impossibleOutcome.lastDiagnosisOutcome = 'wrong'
    impossibleOutcome.submittedDiagnosis = createEndlessCase(6000).diagnosis.correct
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleOutcome))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const noCausalChain = session()
    const caseData = createEndlessCase(6000)
    const solution = enumerateEndlessSolutions(caseData).find((candidate) => candidate.reliable)
    expect(solution).toBeDefined()
    if (!solution) return
    const repeated = { ...noCausalChain.history[0], id: 2 }
    const trainPoints = projectSamples(caseData.train, solution.features)
    const train = evaluate(MODEL_REGISTRY[solution.model].fit(trainPoints), trainPoints).accuracy
    const audit = caseData.audit(solution.model, solution.features)
    const reliableRun = {
      id: 3,
      model: solution.model,
      features: [...solution.features] as EndlessSessionData['features'],
      train,
      test: audit.accuracy,
      errors: audit.errorCount,
      prediction: accuracyBand(audit.accuracy),
      predictionHit: true,
      recall: audit.recall,
      reliable: caseData.isReliable(audit),
    }
    noCausalChain.history = [noCausalChain.history[0], repeated, reliableRun]
    noCausalChain.model = reliableRun.model
    noCausalChain.features = reliableRun.features
    noCausalChain.solved = true
    noCausalChain.diagnosisAttempts = 1
    noCausalChain.diagnosis = caseData.diagnosis.correct
    noCausalChain.submittedDiagnosis = noCausalChain.diagnosis
    noCausalChain.selectedEvidenceRunIds = [1, 2]
    storage.setItem(endlessSessionKey(6000), JSON.stringify(noCausalChain))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('rejects forged failed-diagnosis checkpoints that bypass the fresh-evidence lock', () => {
    const storage = new MemoryStorage()
    const value = session()
    const caseData = createEndlessCase(6000)
    const secondConfig = enumerateEndlessSolutions(caseData).find((candidate) =>
      candidate.model !== value.history[0].model
      || candidate.features.some((feature, index) => feature !== value.history[0].features[index]),
    )
    expect(secondConfig).toBeDefined()
    if (!secondConfig) return

    const trainPoints = projectSamples(caseData.train, secondConfig.features)
    const train = evaluate(MODEL_REGISTRY[secondConfig.model].fit(trainPoints), trainPoints).accuracy
    const audit = caseData.audit(secondConfig.model, secondConfig.features)
    const secondRun = {
      id: 2,
      model: secondConfig.model,
      features: [...secondConfig.features] as EndlessSessionData['features'],
      train,
      test: audit.accuracy,
      errors: audit.errorCount,
      prediction: accuracyBand(audit.accuracy),
      predictionHit: true,
      recall: audit.recall,
      reliable: caseData.isReliable(audit),
    }
    const secondDelta = experimentDelta(value.history[0], secondRun)
    value.history.push({
      ...secondRun,
      ...(secondDelta === 'fields-only' || secondDelta === 'model-only' ? { causalPrediction: 'improved' as const } : {}),
    })
    value.model = secondConfig.model
    value.features = [...secondConfig.features]
    value.diagnosisAttempts = 1
    value.submittedDiagnosis = (['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'] as const)
      .find((diagnosis) => diagnosis !== caseData.diagnosis.correct)
    value.lastDiagnosisOutcome = 'wrong'
    value.lastDiagnosisConfigCount = 2
    value.lastDiagnosisRunCount = 2

    storage.setItem(endlessSessionKey(6000), JSON.stringify(value))
    expect(readEndlessSession(storage, 6000)).toEqual(value)

    const forgedConfigCheckpoint = { ...value, lastDiagnosisConfigCount: 0 }
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedConfigCheckpoint))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const forgedRunCheckpoint = { ...value, lastDiagnosisRunCount: 0 }
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedRunCheckpoint))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('rejects histories that erase or invent causal preregistrations after an audit', () => {
    const storage = new MemoryStorage()
    const value = session()
    const caseData = createEndlessCase(6000)
    const controlled = enumerateEndlessSolutions(caseData).find((candidate) => {
      const next = {
        ...value.history[0],
        id: 2,
        model: candidate.model,
        features: [...candidate.features] as EndlessSessionData['features'],
      }
      const delta = experimentDelta(value.history[0], next)
      return delta === 'fields-only' || delta === 'model-only'
    })
    expect(controlled).toBeDefined()
    if (!controlled) return

    const trainPoints = projectSamples(caseData.train, controlled.features)
    const train = evaluate(MODEL_REGISTRY[controlled.model].fit(trainPoints), trainPoints).accuracy
    const audit = caseData.audit(controlled.model, controlled.features)
    const controlledRun = {
      id: 2,
      model: controlled.model,
      features: [...controlled.features] as EndlessSessionData['features'],
      train,
      test: audit.accuracy,
      errors: audit.errorCount,
      prediction: accuracyBand(audit.accuracy),
      predictionHit: true,
      causalPrediction: 'improved' as const,
      recall: audit.recall,
      reliable: caseData.isReliable(audit),
    }
    value.history.push(controlledRun)
    value.model = controlledRun.model
    value.features = controlledRun.features
    storage.setItem(endlessSessionKey(6000), JSON.stringify(value))
    expect(readEndlessSession(storage, 6000)).toEqual(value)

    const erasedForecast = structuredClone(value)
    delete erasedForecast.history[1].causalPrediction
    storage.setItem(endlessSessionKey(6000), JSON.stringify(erasedForecast))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const fabricatedBaselineForecast = structuredClone(session())
    fabricatedBaselineForecast.history[0].causalPrediction = 'null'
    storage.setItem(endlessSessionKey(6000), JSON.stringify(fabricatedBaselineForecast))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const repeated = structuredClone(value)
    repeated.history.push({ ...repeated.history[1], id: 3, causalPrediction: 'null' })
    repeated.model = repeated.history[2].model
    repeated.features = repeated.history[2].features
    storage.setItem(endlessSessionKey(6000), JSON.stringify(repeated))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('rejects impossible cross-field session relationships', () => {
    const storage = new MemoryStorage()
    const impossibleCitation = session()
    impossibleCitation.selectedEvidenceRunIds = [99]
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleCitation))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleAudit = session()
    impossibleAudit.auditComplete = true
    impossibleAudit.model = 'tree'
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleAudit))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleInspection = session()
    impossibleInspection.inspectedFieldErrors[0].runId = 7
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleInspection))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const impossibleLeadBudget = session()
    impossibleLeadBudget.inspectedCaseLeadIds = ['composition', 'batch']
    storage.setItem(endlessSessionKey(6000), JSON.stringify(impossibleLeadBudget))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const duplicateLead = session()
    duplicateLead.inspectedCaseLeadIds = ['quality', 'quality']
    storage.setItem(endlessSessionKey(6000), JSON.stringify(duplicateLead))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const forgedEmergencyCredit = session()
    forgedEmergencyCredit.emergencyCredits = 1
    storage.setItem(endlessSessionKey(6000), JSON.stringify(forgedEmergencyCredit))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()

    const unpaidExtraAudits = session()
    unpaidExtraAudits.history = Array.from({ length: 6 }, (_, index) => ({ ...unpaidExtraAudits.history[0], id: index + 1 }))
    unpaidExtraAudits.emergencyCredits = 0
    storage.setItem(endlessSessionKey(6000), JSON.stringify(unpaidExtraAudits))
    expect(readEndlessSession(storage, 6000)).toBeUndefined()
  })

  it('distinguishes blank storage from resumable progress and derives remaining budget', () => {
    const active = session()
    expect(hasEndlessSessionProgress(active)).toBe(true)
    expect(remainingEndlessAuditCredits(active)).toBe(4)

    const blank: EndlessSessionData = {
      ...active,
      trained: false,
      auditComplete: false,
      history: [],
      inspectedFieldErrors: [],
    }
    expect(hasEndlessSessionProgress(blank)).toBe(false)
    expect(remainingEndlessAuditCredits(blank)).toBe(5)
  })
})
