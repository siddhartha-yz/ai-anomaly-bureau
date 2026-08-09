import { useEffect, useMemo, useRef, useState } from 'react'
import { GameAudio } from '../game/audio'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY, type ModelId } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import { EndlessControls } from './EndlessControls'
import { EndlessAuditPanel, EndlessDiagnosis, EndlessRunLog } from './EndlessEvidence'
import { EndlessPlot, type EndlessAudit } from './EndlessPlot'
import { createEndlessCase, type EndlessSyndrome } from './generator'
import { accuracyBand, type BandPrediction, type EndlessRunRecord } from './uiTypes'

export function EndlessMode({ initialSeed, onExit }: { initialSeed: number; onExit: () => void }) {
  const [seed, setSeed] = useState(initialSeed)
  const caseData = useMemo(() => createEndlessCase(seed), [seed])
  const audioRef = useRef<GameAudio | null>(null)
  if (!audioRef.current) audioRef.current = new GameAudio(true)
  const audio = audioRef.current
  const [audioEnabled, setAudioEnabled] = useState(true)

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
  const [features, setFeatures] = useState<[FeatureKey, FeatureKey]>(['warmth', 'roundness'])
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
  const [model, setModel] = useState<ModelId>('linear')
  const [trained, setTrained] = useState(false)
  const [trainAccuracy, setTrainAccuracy] = useState<number>()
  const [auditResult, setAuditResult] = useState<EndlessAudit>()
  const [prediction, setPrediction] = useState<BandPrediction>()
  const [credits, setCredits] = useState(5)
  const [emergencyCredits, setEmergencyCredits] = useState(0)
  const [history, setHistory] = useState<EndlessRunRecord[]>([])
  const [diagnosis, setDiagnosis] = useState<EndlessSyndrome>()
  const [diagnosisAttempts, setDiagnosisAttempts] = useState(0)
  const [lastDiagnosisAtRun, setLastDiagnosisAtRun] = useState(-1)
  const [submittedDiagnosis, setSubmittedDiagnosis] = useState<EndlessSyndrome>()
  const [lastDiagnosisOutcome, setLastDiagnosisOutcome] = useState<'wrong' | 'needs-reliable'>()
  const [solved, setSolved] = useState(false)

  const resetExperiment = () => {
    setTrained(false)
    setTrainAccuracy(undefined)
    setAuditResult(undefined)
    setPrediction(undefined)
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
  }

  const audit = () => {
    if (!trained || trainAccuracy === undefined || !prediction || credits <= 0) return
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
      recall: result.recall,
      reliable: caseData.isReliable(result),
    }
    setAuditResult(result)
    setCredits((value) => value - 1)
    setHistory((records) => [...records, record])
    setPrediction(undefined)
  }

  const best = Math.max(0, ...history.map((record) => record.test))
  const bestReliable = history.filter((record) => record.reliable).sort((a, b) => b.test - a.test)[0]
  const canSubmitDiagnosis = history.length >= 2 && history.length > lastDiagnosisAtRun
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
    setLastDiagnosisAtRun(history.length)
  }

  const requestEmergencyAudit = () => {
    audio.play('warning')
    setCredits((value) => value + 1)
    setEmergencyCredits((value) => value + 1)
  }

  const nextCase = () => {
    audio.play('ui')
    setSeed((value) => value + 1)
    setFeatures(['warmth', 'roundness'])
    setActiveSlot(0)
    setModel('linear')
    setTrained(false)
    setTrainAccuracy(undefined)
    setAuditResult(undefined)
    setPrediction(undefined)
    setCredits(5)
    setEmergencyCredits(0)
    setHistory([])
    setDiagnosis(undefined)
    setDiagnosisAttempts(0)
    setLastDiagnosisAtRun(-1)
    setSubmittedDiagnosis(undefined)
    setLastDiagnosisOutcome(undefined)
    setSolved(false)
  }

  const auditsUsed = history.length
  const score = Math.max(40, Math.min(100,
    100 - Math.max(0, auditsUsed - 3) * 4 - emergencyCredits * 12 - Math.max(0, diagnosisAttempts - 1) * 8
      + history.filter((record) => record.predictionHit).length * 2,
  ))
  const grade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : 'C'

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
          <button type="button" onClick={onExit}>返回剧情案件</button>
        </div>
      </header>

      <section className="endless-case-brief">
        <div>
          <span>CASE {String(caseData.caseNo).padStart(4, '0')}</span><h2>{caseData.title}</h2><p>{caseData.incident}</p>
          <div className="archive-composition">历史档案：{caseData.classNames.cat} {caseData.train.filter((sample) => sample.label === 'cat').length} · {caseData.classNames.bread} {caseData.train.filter((sample) => sample.label === 'bread').length}</div>
        </div>
        <div className="endless-objective"><strong>目标</strong><span>用 ≤5 次正式审计找到可靠方案，并提交故障诊断。可靠 = 总体 ≥85%，且两类召回都 ≥75%。</span><b>审计额度 {credits}</b></div>
      </section>

      {!solved ? (
        <div className="endless-workspace">
          <div className="endless-main-column">
            <EndlessPlot caseData={caseData} features={features} model={model} trained={trained} audit={auditResult} />
            {auditResult && trainAccuracy !== undefined && (
              <EndlessAuditPanel caseData={caseData} audit={auditResult} trainAccuracy={trainAccuracy} features={features} lastRun={history.at(-1)} />
            )}
          </div>
          <aside className="endless-console">
            <EndlessControls
              caseData={caseData}
              features={features}
              activeSlot={activeSlot}
              model={model}
              trained={trained}
              trainAccuracy={trainAccuracy}
              prediction={prediction}
              credits={credits}
              auditComplete={Boolean(auditResult)}
              onActiveSlot={setActiveSlot}
              onFeature={installFeature}
              onModel={chooseModel}
              onTrain={train}
              onPrediction={(value) => { audio.play('select'); setPrediction(value) }}
              onAudit={audit}
              onEmergency={requestEmergencyAudit}
            />
            <EndlessRunLog caseData={caseData} history={history} />
            {history.length >= 2 && (
              <EndlessDiagnosis
                caseData={caseData}
                value={diagnosis}
                attempts={diagnosisAttempts}
                best={best}
                canSubmit={canSubmitDiagnosis}
                credits={credits}
                submittedDiagnosis={submittedDiagnosis}
                lastOutcome={lastDiagnosisOutcome}
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
          <div className="endless-rank"><strong>{grade}</strong><span>{score}/100</span><small>可靠未知表现 {Math.round((bestReliable?.test ?? best) * 100)}% · 最低类别召回 {Math.round(Math.min(bestReliable?.recall.cat ?? 0, bestReliable?.recall.bread ?? 0) * 100)}% · {history.length} 次审计</small></div>
          <div className="endless-solved-actions"><button type="button" onClick={nextCase}>生成下一起案件</button><button type="button" onClick={onExit}>返回剧情案件</button></div>
        </section>
      )}
    </main>
  )
}
