import { useState } from 'react'
import { STORY_CASE_001, TRAINING_CASE_000, type FormalCaseId, type TrainingCaseId } from './bureau/catalog'
import { clearDutyProgress, readDutyResume } from './bureau/duty'
import { acknowledgeBureauInduction, isBureauUnlocked, isTrainingCaseCompleted, readBureauProgress, reconcileLegacyProgress, recordDutyResolution, recordFormalCaseResolution, recordTrainingCaseCompletion, writeBureauProgress, type BureauProgress } from './bureau/progress'
import { BureauHub, type HubSection } from './components/BureauHub'
import { FormalCaseResume } from './components/FormalCaseResume'
import { EndlessIntro } from './endless/EndlessIntro'
import { EndlessMode } from './endless/EndlessMode'
import { CHEAT_AUTO_RESUME_KEY } from './game/cheats'
import { formalCaseRuntime, readFormalCaseResumes } from './story/registry'
import { trainingCaseRuntime } from './training/registry'

const LEGACY_BOOT_COMPLETION_KEY = 'aia.boot-case-000.v2'

type AppMode = 'hub' | 'formal-case' | 'endless-intro' | 'training' | 'endless'

function App() {
  const params = new URLSearchParams(window.location.search)
  const initialSeed = Number(params.get('seed')) || 20260809
  const requestedMode = params.get('mode')
  const legacyBootCompleted = window.localStorage.getItem(LEGACY_BOOT_COMPLETION_KEY) === 'complete'
  const inductionRuntime = formalCaseRuntime(STORY_CASE_001.id)
  const [bureauProgress, setBureauProgress] = useState<BureauProgress>(() => {
    let progress = readBureauProgress(window.localStorage)
    progress = inductionRuntime.reconcileProgress(window.localStorage, initialSeed, progress)
    progress = reconcileLegacyProgress(progress, {
      storyResolved: Boolean(inductionRuntime.readResume(window.localStorage, initialSeed)?.solved),
      bootCompleted: legacyBootCompleted,
    })
    writeBureauProgress(window.localStorage, progress)
    return progress
  })
  const [formalCaseSeed] = useState(initialSeed)
  const [dutySeed, setDutySeed] = useState(initialSeed)
  const [formalCaseSession, setFormalCaseSession] = useState(0)
  const [formalCaseId, setFormalCaseId] = useState<FormalCaseId>(STORY_CASE_001.id)
  const [trainingCaseId, setTrainingCaseId] = useState<TrainingCaseId>(TRAINING_CASE_000.id)
  const [mode, setMode] = useState<AppMode>(() => {
    if (requestedMode === 'hub') return 'hub'
    if (requestedMode === 'endless') return 'endless'
    if (requestedMode === 'boot') return 'training'
    if (requestedMode === 'story') return 'formal-case'
    return isBureauUnlocked(bureauProgress) ? 'hub' : 'formal-case'
  })
  const [hubSection, setHubSection] = useState<HubSection>('case-board')
  const [endlessReturnTarget, setEndlessReturnTarget] = useState<'hub' | 'formal-case'>(isBureauUnlocked(bureauProgress) ? 'hub' : 'formal-case')
  const [trainingOrigin, setTrainingOrigin] = useState<'hub' | 'endless-intro'>('endless-intro')
  const [formalCaseResumeAccepted, setFormalCaseResumeAccepted] = useState(() => {
    const pendingSeed = window.sessionStorage.getItem(CHEAT_AUTO_RESUME_KEY)
    if (pendingSeed !== String(initialSeed)) return false
    window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
    return true
  })
  const activeFormalRuntime = formalCaseRuntime(formalCaseId)
  const FormalCaseComponent = activeFormalRuntime.Component
  const activeTrainingRuntime = trainingCaseRuntime(trainingCaseId)
  const TrainingCaseComponent = activeTrainingRuntime.Component
  const formalCaseResumes = readFormalCaseResumes(window.localStorage, formalCaseSeed)
  const formalCaseResume = formalCaseResumes[formalCaseId]
  const endlessResume = readDutyResume(window.localStorage, dutySeed)

  const restartFormalCase = () => {
    activeFormalRuntime.clearSession(window.localStorage, formalCaseSeed)
    setFormalCaseSession((value) => value + 1)
  }

  const updateBureauProgress = (update: (current: BureauProgress) => BureauProgress) => {
    setBureauProgress((current) => {
      const next = update(current)
      writeBureauProgress(window.localStorage, next)
      return next
    })
  }

  const openFormalCaseFromHub = (caseId: FormalCaseId) => {
    const runtime = formalCaseRuntime(caseId)
    setFormalCaseId(caseId)
    setHubSection('case-board')
    setFormalCaseResumeAccepted(Boolean(runtime.readResume(window.localStorage, formalCaseSeed)?.solved))
    setMode('formal-case')
  }

  if (mode === 'hub') {
    return (
      <BureauHub
        section={hubSection}
        progress={bureauProgress}
        formalCaseResumes={formalCaseResumes}
        endlessResume={endlessResume}
        dutySeed={dutySeed}
        onOpenFormalCase={openFormalCaseFromHub}
        onTraining={(caseId) => {
          setTrainingCaseId(caseId)
          setHubSection('training')
          setTrainingOrigin('hub')
          setMode('training')
        }}
        onDuty={(selectedDutySeed) => {
          setHubSection('duty')
          if (selectedDutySeed !== dutySeed) setDutySeed(selectedDutySeed)
          setEndlessReturnTarget('hub')
          setMode('endless-intro')
        }}
        onAcknowledgeInduction={() => updateBureauProgress((current) => acknowledgeBureauInduction(current))}
        onSectionChange={setHubSection}
      />
    )
  }

  if (mode === 'endless-intro') {
    return (
      <EndlessIntro
        bootCompleted={isTrainingCaseCompleted(bureauProgress, TRAINING_CASE_000.id)}
        resume={endlessResume}
        onBoot={() => {
          setTrainingCaseId(TRAINING_CASE_000.id)
          setTrainingOrigin('endless-intro')
          setMode('training')
        }}
        onSkip={() => setMode('endless')}
        onNewCase={() => {
          const nextSeed = dutySeed + 1
          clearDutyProgress(window.localStorage, dutySeed)
          clearDutyProgress(window.localStorage, nextSeed)
          setDutySeed(nextSeed)
          setMode('endless')
        }}
        backLabel={endlessReturnTarget === 'hub' ? '返回调查局' : '返回剧情案件'}
        onBack={() => setMode(endlessReturnTarget)}
      />
    )
  }

  if (mode === 'training') {
    return <TrainingCaseComponent onComplete={() => {
      updateBureauProgress((current) => recordTrainingCaseCompletion(current, trainingCaseId))
      setMode(trainingOrigin === 'hub' ? 'hub' : 'endless')
    }} onBack={() => setMode(trainingOrigin === 'hub' ? 'hub' : 'endless-intro')} />
  }

  if (mode === 'endless') {
    return <EndlessMode
      initialSeed={dutySeed}
      exitLabel={endlessReturnTarget === 'hub' ? '返回调查局' : '返回剧情案件'}
      onSeedChange={setDutySeed}
      onResolved={isBureauUnlocked(bureauProgress) ? (result) => updateBureauProgress((current) => recordDutyResolution(current, result)) : undefined}
      onExit={() => setMode(endlessReturnTarget)}
    />
  }

  if (mode === 'formal-case' && formalCaseResume && !formalCaseResumeAccepted) {
    return (
      <FormalCaseResume
        definition={activeFormalRuntime.definition}
        summary={formalCaseResume}
        onContinue={() => setFormalCaseResumeAccepted(true)}
        onDiscard={() => {
          activeFormalRuntime.clearSession(window.localStorage, formalCaseSeed)
          setFormalCaseSession((value) => value + 1)
          setFormalCaseResumeAccepted(true)
        }}
      />
    )
  }

  return (
    <FormalCaseComponent
      key={`${formalCaseId}-${formalCaseSeed}-${formalCaseSession}`}
      seed={formalCaseSeed}
      onRestart={restartFormalCase}
      onCaseClosed={({ grade, score }) => updateBureauProgress((current) => recordFormalCaseResolution(current, formalCaseId, grade, score))}
      onReturnToBureau={isBureauUnlocked(bureauProgress) ? () => {
        setFormalCaseResumeAccepted(false)
        setMode('hub')
      } : undefined}
    />
  )
}

export default App
