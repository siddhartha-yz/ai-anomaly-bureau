import { useEffect, useMemo, useRef, useState } from 'react'
import { GameAudio } from '../game/audio'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_META, MODEL_REGISTRY, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import { EndlessControls } from './EndlessControls'
import { EndlessAuditPanel, EndlessDiagnosis, EndlessRunLog } from './EndlessEvidence'
import { FieldManual } from './FieldManual'
import { canInspectCaseLead, EndlessArchiveEvidence, EndlessLeadBoard, EndlessObjective, objectiveFor } from './EndlessNavigator'
import { EndlessPlot, type EndlessAudit } from './EndlessPlot'
import { createEndlessCase, type EndlessCaseLeadId, type EndlessSyndrome } from './generator'
import { ENDLESS_SESSION_VERSION, clearEndlessSession, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits, writeEndlessSession } from './session'
import { accuracyBand, caseLeadForecastStats, causalForecastStats, compareExperimentRecords, competingAxisNullResult, diagnosisEvidenceStatus, diagnosisInterventionAxis, diagnosisSourceLeadId, diagnosisSourceStatus, diagnosisSourceSupported, discriminatingExperiment, experimentConfigKey, experimentDelta, experimentPlanDelta, latestDiscriminatingExperiment, latestFalsifiedDiscriminatingExperiment, latestReliableDiscriminatingExperiment, type BandPrediction, type CaseLeadPrediction, type CaseLeadPredictions, type CausalPrediction, type EndlessRunRecord, type InspectedFieldError } from './uiTypes'

function calculateTrainAccuracy(caseData: ReturnType<typeof createEndlessCase>, model: ModelId, features: [FeatureKey, FeatureKey]) {
  const points = projectSamples(caseData.train, features)
  return evaluate(MODEL_REGISTRY[model].fit(points), points).accuracy
}

type EndlessResolutionSummary = {
  seed: number
  syndrome: EndlessSyndrome
  grade: 'S' | 'A' | 'B' | 'C'
  score: number
}

export function EndlessMode({ initialSeed, onExit, onSeedChange, onResolved, exitLabel = '返回剧情案件' }: {
  initialSeed: number
  onExit: () => void
  onSeedChange?: (seed: number) => void
  onResolved?: (result: EndlessResolutionSummary) => void
  exitLabel?: string
}) {
  const [seed, setSeed] = useState(initialSeed)
  const caseData = useMemo(() => createEndlessCase(seed), [seed])
  const restoredSession = useMemo(() => readEndlessSession(window.localStorage, seed), [seed])
  const restoredTrainAccuracy = restoredSession?.trained
    ? calculateTrainAccuracy(caseData, restoredSession.model, restoredSession.features)
    : undefined
  const restoredAudit = restoredSession?.auditComplete && restoredSession.trained
    ? caseData.audit(restoredSession.model, restoredSession.features)
    : undefined
  const restoredProgress = hasEndlessSessionProgress(restoredSession)
  const audioRef = useRef<GameAudio | null>(null)
  if (!audioRef.current) audioRef.current = new GameAudio(true)
  const audio = audioRef.current
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [manualOpen, setManualOpen] = useState(false)
  const [sessionRestoredNotice, setSessionRestoredNotice] = useState(restoredProgress)
  const [resetArmed, setResetArmed] = useState(false)
  const [selectedArchiveId, setSelectedArchiveId] = useState<string>()
  const [inspectedArchiveIds, setInspectedArchiveIds] = useState<string[]>(restoredSession?.inspectedArchiveIds ?? [])
  const [inspectedCaseLeadIds, setInspectedCaseLeadIds] = useState<EndlessCaseLeadId[]>(restoredSession?.inspectedCaseLeadIds ?? [])
  const [caseLeadPredictions, setCaseLeadPredictions] = useState<CaseLeadPredictions>(restoredSession?.caseLeadPredictions ?? {})
  const [selectedFieldErrorId, setSelectedFieldErrorId] = useState<string>()
  const [inspectedFieldErrors, setInspectedFieldErrors] = useState<InspectedFieldError[]>(restoredSession?.inspectedFieldErrors ?? [])

  useEffect(() => {
    audio.setPhase(2)
    const startAudio = () => { void audio.ensureStarted() }
    window.addEventListener('pointerdown', startAudio, { once: true })
    window.addEventListener('keydown', startAudio, { once: true })
    return () => {
      window.removeEventListener('pointerdown', startAudio)
      window.removeEventListener('keydown', startAudio)
      audio.dispose()
    }
  }, [audio])
  const [features, setFeatures] = useState<[FeatureKey, FeatureKey]>(restoredSession?.features ?? caseData.baseline.features)
  const [activeSlot, setActiveSlot] = useState<0 | 1>(restoredSession?.activeSlot ?? 0)
  const [model, setModel] = useState<ModelId>(restoredSession?.model ?? caseData.baseline.model)
  const [trained, setTrained] = useState(restoredSession?.trained ?? false)
  const [trainAccuracy, setTrainAccuracy] = useState<number | undefined>(restoredTrainAccuracy)
  const [auditResult, setAuditResult] = useState<EndlessAudit | undefined>(restoredAudit)
  const [prediction, setPrediction] = useState<BandPrediction | undefined>(restoredSession?.prediction)
  const [causalPrediction, setCausalPrediction] = useState<CausalPrediction | undefined>(restoredSession?.causalPrediction)
  const [credits, setCredits] = useState(restoredSession ? remainingEndlessAuditCredits(restoredSession) : 5)
  const [emergencyCredits, setEmergencyCredits] = useState(restoredSession?.emergencyCredits ?? 0)
  const [history, setHistory] = useState<EndlessRunRecord[]>(restoredSession?.history ?? [])
  const [diagnosis, setDiagnosis] = useState<EndlessSyndrome | undefined>(restoredSession?.diagnosis)
  const [diagnosisAttempts, setDiagnosisAttempts] = useState(restoredSession?.diagnosisAttempts ?? 0)
  const [lastDiagnosisConfigCount, setLastDiagnosisConfigCount] = useState(restoredSession?.lastDiagnosisConfigCount ?? 0)
  const [lastDiagnosisRunCount, setLastDiagnosisRunCount] = useState(restoredSession?.lastDiagnosisRunCount ?? 0)
  const [selectedEvidenceRunIds, setSelectedEvidenceRunIds] = useState<number[]>(restoredSession?.selectedEvidenceRunIds ?? [])
  const [submittedDiagnosis, setSubmittedDiagnosis] = useState<EndlessSyndrome | undefined>(restoredSession?.submittedDiagnosis)
  const [lastDiagnosisOutcome, setLastDiagnosisOutcome] = useState<'wrong' | 'needs-reliable' | undefined>(restoredSession?.lastDiagnosisOutcome)
  const [solved, setSolved] = useState(restoredSession?.solved ?? false)
  const reportedResolutionSeed = useRef<number | undefined>(undefined)

  useEffect(() => {
    writeEndlessSession(window.localStorage, {
      version: ENDLESS_SESSION_VERSION,
      seed,
      features,
      activeSlot,
      model,
      trained,
      prediction,
      causalPrediction,
      auditComplete: Boolean(auditResult),
      emergencyCredits,
      history,
      diagnosis,
      diagnosisAttempts,
      lastDiagnosisConfigCount,
      lastDiagnosisRunCount,
      selectedEvidenceRunIds,
      submittedDiagnosis,
      lastDiagnosisOutcome,
      inspectedArchiveIds,
      inspectedCaseLeadIds,
      caseLeadPredictions,
      inspectedFieldErrors,
      solved,
    })
  }, [
    seed, features, activeSlot, model, trained, prediction, causalPrediction, auditResult, emergencyCredits, history,
    diagnosis, diagnosisAttempts, lastDiagnosisConfigCount, lastDiagnosisRunCount, selectedEvidenceRunIds,
    submittedDiagnosis, lastDiagnosisOutcome, inspectedArchiveIds, inspectedCaseLeadIds, caseLeadPredictions, inspectedFieldErrors, solved,
  ])

  const resetExperiment = () => {
    setTrained(false)
    setTrainAccuracy(undefined)
    setAuditResult(undefined)
    setPrediction(undefined)
    setCausalPrediction(undefined)
    setSelectedFieldErrorId(undefined)
  }

  const installFeature = (feature: FeatureKey) => {
    audio.play('select')
    const installedAt = features.indexOf(feature)
    if (installedAt === activeSlot) return
    if (installedAt >= 0) {
      setFeatures([features[1], features[0]])
      setActiveSlot(activeSlot === 0 ? 1 : 0)
      resetExperiment()
      return
    }
    const next: [FeatureKey, FeatureKey] = [...features]
    next[activeSlot] = feature
    setFeatures(next)
    setActiveSlot(activeSlot === 0 ? 1 : 0)
    resetExperiment()
  }

  const chooseModel = (next: ModelId) => {
    audio.play('select')
    setModel(next)
    resetExperiment()
  }

  const train = () => {
    audio.play('train')
    const points = projectSamples(caseData.train, features)
    const fitted = MODEL_REGISTRY[model].fit(points)
    setTrainAccuracy(evaluate(fitted, points).accuracy)
    setTrained(true)
    setAuditResult(undefined)
    setPrediction(undefined)
    setSelectedFieldErrorId(undefined)
  }

  const audit = () => {
    const planDelta = experimentPlanDelta(history.at(-1), model, features)
    const controlledPlan = planDelta === 'fields-only' || planDelta === 'model-only'
    if (!trained || trainAccuracy === undefined || !prediction || credits <= 0 || (controlledPlan && !causalPrediction)) return
    audio.play('audit')
    const result = caseData.audit(model, features)
    const record: EndlessRunRecord = {
      id: history.length + 1,
      model,
      features: [...features],
      train: trainAccuracy,
      test: result.accuracy,
      errors: result.errorCount,
      prediction,
      predictionHit: prediction === accuracyBand(result.accuracy),
      ...(controlledPlan && causalPrediction ? { causalPrediction } : {}),
      recall: result.recall,
      reliable: caseData.isReliable(result),
    }
    setAuditResult(result)
    setCredits((value) => value - 1)
    setHistory((records) => [...records, record])
    setPrediction(undefined)
    setCausalPrediction(undefined)
  }

  const best = Math.max(0, ...history.map((record) => record.test))
  const bestReliable = history.filter((record) => record.reliable).sort((a, b) => b.test - a.test)[0]
  const distinctConfigCount = new Set(history.map((record) => experimentConfigKey(record.model, record.features))).size
  const discriminatingEvidence = latestDiscriminatingExperiment(history, lastDiagnosisRunCount)
  const resolutionEvidence = latestReliableDiscriminatingExperiment(history, lastDiagnosisRunCount)
  const sourceFalsificationLead = inspectedCaseLeadIds
    .map((id) => caseData.leadSources.find((lead) => lead.id === id))
    .find((lead) => lead?.result === 'clear')
  const sourceFalsification = Boolean(sourceFalsificationLead)
  const falsifiedInterventionEvidence = latestFalsifiedDiscriminatingExperiment(history, lastDiagnosisRunCount, true)
  const falsificationReady = sourceFalsification || Boolean(falsifiedInterventionEvidence)
  const diagnosisAvailable = distinctConfigCount >= 2
    && Boolean(resolutionEvidence)
    && Boolean(bestReliable)
    && inspectedCaseLeadIds.length > 0
    && falsificationReady
    && (diagnosisAttempts === 0 || distinctConfigCount > lastDiagnosisConfigCount)
  const citedEvidence = diagnosisEvidenceStatus(history, selectedEvidenceRunIds, lastDiagnosisRunCount)
  const citedDiscrimination = citedEvidence.records.length === 2
    ? discriminatingExperiment(citedEvidence.records[0], citedEvidence.records[1])
    : undefined
  const evidenceReady = citedEvidence.ready && Boolean(citedDiscrimination?.discriminating)
  const citedInterventionFalsification = competingAxisNullResult(history, citedDiscrimination && citedEvidence.records.length === 2
    ? { first: citedEvidence.records[0], second: citedEvidence.records[1], comparison: citedDiscrimination }
    : undefined, lastDiagnosisRunCount)
  const citedFalsificationReady = sourceFalsification || Boolean(citedInterventionFalsification)
  const citedFalsificationSummary = sourceFalsificationLead
    ? `${sourceFalsificationLead.label}返回 CLEAR`
    : citedInterventionFalsification
      ? `E${String(citedInterventionFalsification.first.id).padStart(2, '0')} + E${String(citedInterventionFalsification.second.id).padStart(2, '0')} 的${citedInterventionFalsification.comparison.axis === 'fields' ? '字段' : '模型'}轴 null 对照`
      : undefined
  const reportReady = evidenceReady && citedFalsificationReady
  const diagnosisEvidenceAligned = !diagnosis || citedDiscrimination?.axis === diagnosisInterventionAxis(diagnosis)
  const diagnosisSourceState = diagnosis ? diagnosisSourceStatus(diagnosis, inspectedCaseLeadIds, caseData.leadSources) : 'not-required'
  const diagnosisSourceReady = !diagnosis || diagnosisSourceSupported(diagnosis, inspectedCaseLeadIds, caseData.leadSources)
  const diagnosisSourceContradicted = diagnosisSourceState === 'contradicted'
  const canSubmitDiagnosis = diagnosisAvailable && reportReady && diagnosisEvidenceAligned && diagnosisSourceReady
  const diagnosisLocked = diagnosisAttempts > 0 && !diagnosisAvailable
  const latestRunId = history.at(-1)?.id
  const needsFieldInspection = history.length === 1
    && Boolean(auditResult?.mistakes.length)
    && Boolean(latestRunId)
    && !inspectedFieldErrors.some((item) => item.runId === latestRunId)
  const objective = objectiveFor({
    trained,
    auditComplete: Boolean(auditResult),
    history,
    diagnosisAvailable,
    evidenceReady: reportReady,
    diagnosisSourceReady,
    diagnosisSourceContradicted,
    diagnosisLocked,
    credits,
    needsFieldInspection,
    inspectedCaseLeadCount: inspectedCaseLeadIds.length,
    needsFalsification: Boolean(bestReliable && discriminatingEvidence && inspectedCaseLeadIds.length > 0 && !falsificationReady),
  })
  const toggleEvidenceRun = (runId: number) => {
    setSelectedEvidenceRunIds((ids) => {
      if (ids.includes(runId)) return ids.filter((id) => id !== runId)
      if (ids.length >= 2) return ids
      return [...ids, runId]
    })
  }
  const submitDiagnosis = () => {
    if (!diagnosis || !canSubmitDiagnosis) return
    setDiagnosisAttempts((value) => value + 1)
    setSubmittedDiagnosis(diagnosis)
    if (diagnosis === caseData.diagnosis.correct && bestReliable) {
      audio.play('success')
      setLastDiagnosisOutcome(undefined)
      setSolved(true)
      return
    }
    audio.play('warning')
    setLastDiagnosisOutcome(diagnosis === caseData.diagnosis.correct ? 'needs-reliable' : 'wrong')
    setLastDiagnosisConfigCount(distinctConfigCount)
    setLastDiagnosisRunCount(history.length)
    setSelectedEvidenceRunIds([])
  }

  const requestEmergencyAudit = () => {
    audio.play('warning')
    setCredits((value) => value + 1)
    setEmergencyCredits((value) => value + 1)
  }

  const inspectFieldError = (mistake: EndlessAudit['mistakes'][number]) => {
    const runId = history.at(-1)?.id
    if (!runId) return
    audio.play('evidence')
    setSelectedFieldErrorId(mistake.id)
    setInspectedFieldErrors((items) => {
      if (items.some((item) => item.runId === runId && item.sampleId === mistake.id)) return items
      return [...items, { runId, sampleId: mistake.id, actual: mistake.actual, predicted: mistake.predicted }]
    })
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.endless-plot-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const resetCaseState = (baseline = caseData.baseline) => {
    setFeatures([...baseline.features])
    setActiveSlot(0)
    setModel(baseline.model)
    setTrained(false)
    setTrainAccuracy(undefined)
    setAuditResult(undefined)
    setPrediction(undefined)
    setCausalPrediction(undefined)
    setCredits(5)
    setEmergencyCredits(0)
    setHistory([])
    setDiagnosis(undefined)
    setDiagnosisAttempts(0)
    setLastDiagnosisConfigCount(0)
    setLastDiagnosisRunCount(0)
    setSelectedEvidenceRunIds([])
    setSubmittedDiagnosis(undefined)
    setLastDiagnosisOutcome(undefined)
    setSelectedArchiveId(undefined)
    setInspectedArchiveIds([])
    setInspectedCaseLeadIds([])
    setCaseLeadPredictions({})
    setSelectedFieldErrorId(undefined)
    setInspectedFieldErrors([])
    setSolved(false)
    setSessionRestoredNotice(false)
    setResetArmed(false)
  }

  const resetCurrentCase = () => {
    audio.play('warning')
    clearEndlessSession(window.localStorage, seed)
    resetCaseState()
  }

  const nextCase = () => {
    audio.play('ui')
    const nextSeed = seed + 1
    const nextBaseline = createEndlessCase(nextSeed).baseline
    clearEndlessSession(window.localStorage, seed)
    clearEndlessSession(window.localStorage, nextSeed)
    resetCaseState(nextBaseline)
    setSeed(nextSeed)
    onSeedChange?.(nextSeed)
  }

  const auditsUsed = history.length
  const experimentDeltas = history.map((record, index) => {
    const seenBefore = history.slice(0, index).some((previous) =>
      experimentConfigKey(previous.model, previous.features) === experimentConfigKey(record.model, record.features),
    )
    return seenBefore ? 'repeat' : experimentDelta(history[index - 1], record)
  })
  const controlledComparisons = experimentDeltas.filter((delta) => delta === 'fields-only' || delta === 'model-only').length
  const mixedComparisons = experimentDeltas.filter((delta) => delta === 'mixed').length
  const causalForecast = causalForecastStats(history)
  const sourceForecast = caseLeadForecastStats(caseLeadPredictions, inspectedCaseLeadIds, caseData.leadSources)
  const closureEvidenceComparison = citedEvidence.records.length === 2
    ? compareExperimentRecords(citedEvidence.records[0], citedEvidence.records[1])
    : undefined
  const closureEvidenceLabel = closureEvidenceComparison?.delta === 'fields-only' ? '只换字段'
    : closureEvidenceComparison?.delta === 'model-only' ? '只换模型'
      : closureEvidenceComparison?.delta === 'repeat' ? '同配置复现'
        : closureEvidenceComparison?.delta === 'mixed' ? '字段 + 模型都换'
          : '未形成有效对照'
  const fieldInspectionSummary = inspectedFieldErrors.slice(-3).map((error) =>
    `E${String(error.runId).padStart(2, '0')} ${error.sampleId.toUpperCase()}：${caseData.classNames[error.actual]} → ${caseData.classNames[error.predicted]}`,
  ).join(' · ')
  const closureSupportLeadId = diagnosis ? diagnosisSourceLeadId(diagnosis) : undefined
  const closureSupportLead = closureSupportLeadId && inspectedCaseLeadIds.includes(closureSupportLeadId)
    ? caseData.leadSources.find((lead) => lead.id === closureSupportLeadId && lead.result === 'signal')
    : undefined
  const scoreBeforeCausalCalibration = Math.min(100,
    100 - Math.max(0, auditsUsed - 3) * 4 - emergencyCredits * 12 - Math.max(0, diagnosisAttempts - 1) * 8
      + history.filter((record) => record.predictionHit).length * 2
      + controlledComparisons * 3 - mixedComparisons * 3,
  )
  // A wrong preregistered causal forecast remains useful evidence, but top investigation
  // ratings should distinguish calibrated reasoning from choosing a direction at random.
  const score = Math.max(40, scoreBeforeCausalCalibration - causalForecast.misses * 3)
  const grade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : 'C'

  useEffect(() => {
    if (!solved || reportedResolutionSeed.current === seed || !onResolved) return
    reportedResolutionSeed.current = seed
    onResolved({ seed, syndrome: caseData.syndrome, grade, score })
  }, [caseData.syndrome, grade, onResolved, score, seed, solved])

  return (
    <main className="endless-shell">
      <header className="endless-header">
        <div><small>SUPERVISED INVESTIGATION // ENDLESS</small><h1>监督学习 · 无尽调查</h1></div>
        <div className="endless-header-actions">
          <span>SEED {seed}</span>
          <button type="button" onClick={() => {
            const next = !audioEnabled
            setAudioEnabled(next)
            audio.setEnabled(next)
          }}>{audioEnabled ? '♪ AUDIO' : '× MUTE'}</button>
          <button type="button" onClick={() => setManualOpen(true)}>调查手册</button>
          <button
            type="button"
            className={`endless-reset-case ${resetArmed ? 'armed' : ''}`}
            onClick={() => {
              if (resetArmed) resetCurrentCase()
              else {
                audio.play('warning')
                setResetArmed(true)
              }
            }}
          >
            {resetArmed ? '再次点击确认重置' : '重置本案'}
          </button>
          {!solved && <button type="button" onClick={onExit}>{exitLabel}</button>}
        </div>
      </header>

      <section className="endless-case-brief">
        <div>
          <span>CASE {String(caseData.caseNo).padStart(4, '0')}</span><h2>{caseData.title}</h2><p>{caseData.incident}</p>
          <div className="endless-reported-facts">
            {caseData.reportedFacts.map((fact, index) => <span key={fact}><i>R{index + 1}</i>{fact}</span>)}
          </div>
          <div className="endless-opening-evidence-seal" aria-label="待复核因果线索">
            <b>3 SOURCES SEALED</b><span>档案构成 · 采集批次 · 质量记录</span><small>先用部署配置复现事故。第一条 FIELD 结果出现后，再决定先拆哪份证据。</small>
          </div>
        </div>
        <div className="endless-objective"><strong>结案目标</strong><span>① 找到一个面对现场数据也站得住的方案。② 用多条证据解释系统为什么会坏。</span><small>可靠线：总体 ≥85% · 两类召回都 ≥75%</small><b>审计额度 {credits}</b></div>
      </section>

      {!solved && (
        <EndlessObjective
          objective={objective}
          credits={credits}
          historyCount={history.length}
          configurationCount={distinctConfigCount}
          resumed={sessionRestoredNotice}
          onLocate={() => {
            const selector = objective.target === 'recovery'
              ? '.diagnosis-emergency'
              : objective.target === 'train'
                ? '.objective-action'
                : objective.target === 'field-error'
                  ? '.endless-field-errors'
                  : objective.target === 'lead-board'
                    ? '.endless-causal-leads'
                : objective.target === 'audit'
                  ? '.experiment-console'
                  : objective.target === 'run-log'
                    ? '.endless-run-log'
                    : objective.target === 'diagnosis'
                      ? '.endless-diagnosis'
                      : '.sensor-deck'
            document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        />
      )}

      {!solved ? (
        <div className={`endless-workspace focus-${objective.focus}`}>
          <div className="endless-main-column">
            <EndlessPlot
              caseData={caseData}
              features={features}
              model={model}
              trained={trained}
              audit={auditResult}
              showArchiveAlerts={inspectedCaseLeadIds.includes('quality')}
              selectedArchiveId={selectedArchiveId}
              selectedFieldErrorId={selectedFieldErrorId}
              onArchiveSelect={(id) => {
                audio.play('evidence')
                setSelectedArchiveId(id)
                setInspectedArchiveIds((ids) => ids.includes(id) ? ids : [...ids, id])
              }}
            />
            {auditResult && trainAccuracy !== undefined && (
              <EndlessAuditPanel
                caseData={caseData}
                audit={auditResult}
                trainAccuracy={trainAccuracy}
                features={features}
                lastRun={history.at(-1)}
                selectedMistakeId={selectedFieldErrorId}
                onMistakeSelect={inspectFieldError}
              />
            )}
          </div>
          <aside className="endless-console">
            <EndlessLeadBoard
              caseData={caseData}
              history={history}
              inspectedCaseLeadIds={inspectedCaseLeadIds}
              inspectedArchiveIds={inspectedArchiveIds}
              inspectedFieldErrors={inspectedFieldErrors}
              caseLeadPredictions={caseLeadPredictions}
              onPredictCaseLead={(id, prediction: CaseLeadPrediction) => {
                if (inspectedCaseLeadIds.includes(id)) return
                setCaseLeadPredictions((predictions) => ({ ...predictions, [id]: prediction }))
              }}
              onInspectCaseLead={(id) => {
                if (!canInspectCaseLead(history, inspectedCaseLeadIds.length, inspectedCaseLeadIds.includes(id))) return
                if (!inspectedCaseLeadIds.includes(id) && !caseLeadPredictions[id]) return
                audio.play('evidence')
                setInspectedCaseLeadIds((ids) => ids.includes(id) ? ids : [...ids, id])
              }}
            />
            <EndlessArchiveEvidence caseData={caseData} sampleId={selectedArchiveId} features={features} onClose={() => setSelectedArchiveId(undefined)} />
            <EndlessControls
              caseData={caseData}
              features={features}
              activeSlot={activeSlot}
              model={model}
              trained={trained}
              trainAccuracy={trainAccuracy}
              prediction={prediction}
              causalPrediction={causalPrediction}
              credits={credits}
              auditComplete={Boolean(auditResult)}
              previousRun={history.at(-1)}
              focus={objective.focus}
              onActiveSlot={setActiveSlot}
              onFeature={installFeature}
              onModel={chooseModel}
              onTrain={train}
              onPrediction={(value) => { audio.play('select'); setPrediction(value) }}
              onCausalPrediction={(value) => { audio.play('select'); setCausalPrediction(value) }}
              onAudit={audit}
              onEmergency={requestEmergencyAudit}
            />
            <EndlessRunLog
              caseData={caseData}
              history={history}
              selectedEvidenceIds={selectedEvidenceRunIds}
              evidenceSelectable={diagnosisAvailable}
              lastDiagnosisRunCount={lastDiagnosisRunCount}
              attention={objective.target === 'run-log'}
              onToggleEvidence={(runId) => { audio.play('evidence'); toggleEvidenceRun(runId) }}
            />
            {(diagnosisAvailable || diagnosisAttempts > 0) && (
              <EndlessDiagnosis
                caseData={caseData}
                value={diagnosis}
                attempts={diagnosisAttempts}
                best={best}
                canSubmit={canSubmitDiagnosis}
                credits={credits}
                submittedDiagnosis={submittedDiagnosis}
                lastOutcome={lastDiagnosisOutcome}
                evidenceRecords={citedEvidence.records}
                evidenceReady={evidenceReady}
                falsificationReady={citedFalsificationReady}
                falsificationSummary={citedFalsificationSummary}
                sourceSupportReady={diagnosisSourceReady}
                sourceSupportContradicted={diagnosisSourceContradicted}
                diagnosisAvailable={diagnosisAvailable}
                attention={objective.target === 'diagnosis' || objective.target === 'recovery'}
                onChange={(value) => { audio.play('select'); setDiagnosis(value) }}
                onSubmit={submitDiagnosis}
                onEmergency={requestEmergencyAudit}
              />
            )}
          </aside>
        </div>
      ) : (
        <section className="endless-solved">
          <span>CASE RESOLVED</span>
          <h2>诊断成立：{caseData.diagnosis.options.find((option) => option.id === caseData.syndrome)?.label}</h2>
          <p>{caseData.diagnosis.explanation}</p>
          {bestReliable && (
            <div className="endless-closure-report" aria-label="无尽案件结案报告">
              <article><small>FINAL CONFIG</small><strong>{caseData.featureNames[bestReliable.features[0]]} + {caseData.featureNames[bestReliable.features[1]]}</strong><span>{MODEL_META[bestReliable.model].label}</span></article>
              <article><small>FIELD EVIDENCE</small><strong>{Math.round(bestReliable.test * 100)}%</strong><span>最低类别召回 {Math.round(Math.min(bestReliable.recall.cat, bestReliable.recall.bread) * 100)}%</span></article>
              <article><small>INVESTIGATION</small><strong>{history.length} 次审计</strong><span>{controlledComparisons} 次单变量对照 · 现场预测命中 {history.filter((record) => record.predictionHit).length} 次 · 因果预测 {causalForecast.hits}/{causalForecast.total}</span></article>
              <article><small>SOURCE FORECAST</small><strong>{sourceForecast.hits}/{sourceForecast.total} 命中</strong><span>{sourceForecast.total ? `${sourceForecast.misses} 次来源预判失误；预判只在打开来源前可修改` : '旧存档来源没有预判记录，不计入本项'}</span></article>
              <article><small>EVIDENCE CHAIN</small><strong>{citedEvidence.records.length === 2 ? citedEvidence.records.map((record) => `E${String(record.id).padStart(2, '0')}`).join(' + ') : '未记录'}</strong><span>{closureEvidenceLabel}{closureEvidenceComparison ? ` · FIELD ${Math.round(citedEvidence.records[0].test * 100)}% → ${Math.round(citedEvidence.records[1].test * 100)}%` : ''}</span></article>
              <article><small>FALSIFICATION</small><strong>{citedFalsificationSummary ?? '未记录'}</strong><span>{sourceFalsificationLead ? '原因来源的明确阴性事实' : citedInterventionFalsification ? '与支持证据锚定的竞争轴预注册 null result' : '本案没有封存独立反证'}</span></article>
              <article><small>CAUSAL SUPPORT</small><strong>{closureSupportLead ? `${closureSupportLead.label} · SIGNAL` : '受控实验干预证据'}</strong><span>{closureSupportLead?.finding ?? '本病因没有专属正向来源；支持来自被引用的 material 单变量实验。'}</span></article>
              <article><small>FIELD INSPECTION</small><strong>{inspectedFieldErrors.length} 条误判复核</strong><span>{fieldInspectionSummary || '本次结案没有额外打开现场误判记录'}</span></article>
              <article><small>CAUSE SOURCES</small><strong>{inspectedCaseLeadIds.length} / {caseData.leadSources.length} 份来源已复核</strong><span>{inspectedCaseLeadIds.length ? inspectedCaseLeadIds.map((id) => caseData.leadSources.find((lead) => lead.id === id)?.label).filter(Boolean).join(' · ') : '未复核额外因果来源'}</span></article>
              <article><small>ARCHIVE</small><strong>{inspectedArchiveIds.length} 条档案复核</strong><span>{caseData.archiveAlerts.length ? `本案共有 ${caseData.archiveAlerts.length} 条质量告警` : '本案无额外质量告警'}</span></article>
            </div>
          )}
          <div className="endless-rank"><strong>{grade}</strong><span>{score}/100</span><small>可靠未知表现 {Math.round((bestReliable?.test ?? best) * 100)}% · 最低类别召回 {Math.round(Math.min(bestReliable?.recall.cat ?? 0, bestReliable?.recall.bread ?? 0) * 100)}% · {history.length} 次审计</small><small>实验设计：{controlledComparisons} 次单变量对照 · {mixedComparisons} 次同时改字段与模型 · 因果预测 {causalForecast.hits}/{causalForecast.total}{causalForecast.misses ? `（${causalForecast.misses} 次失误，- ${causalForecast.misses * 3}）` : ''}</small></div>
          <div className="endless-solved-actions"><button type="button" onClick={nextCase}>生成下一起案件</button><button type="button" onClick={onExit}>{exitLabel}</button></div>
        </section>
      )}
      <FieldManual open={manualOpen} onClose={() => setManualOpen(false)} />
    </main>
  )
}
