import { useState } from 'react'
import { STORY_CASE_001, TRAINING_CASE_000, type FormalCaseId } from './bureau/catalog'
import { acknowledgeBureauInduction, isBureauUnlocked, isTrainingCaseCompleted, readBureauProgress, reconcileLegacyProgress, recordDutyResolution, recordFormalCaseResolution, recordTrainingCaseCompletion, writeBureauProgress, type BureauProgress } from './bureau/progress'
import { BureauHub, type HubSection } from './components/BureauHub'
import { FormalCaseResume } from './components/FormalCaseResume'
import { BootCase } from './endless/BootCase'
import { EndlessIntro } from './endless/EndlessIntro'
import { EndlessMode } from './endless/EndlessMode'
import { clearEndlessSession, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits } from './endless/session'
import { CHEAT_AUTO_RESUME_KEY } from './game/cheats'
import { formalCaseRuntime } from './story/registry'

const ENDLESS_BOOT_KEY = 'aia.boot-case-000.v2'

type AppMode = 'hub' | 'story' | 'endless-intro' | 'boot' | 'endless'

function App() {
  const params = new URLSearchParams(window.location.search)
  const initialSeed = Number(params.get('seed')) || 20260809
  const requestedMode = params.get('mode')
  const legacyBootCompleted = window.localStorage.getItem(ENDLESS_BOOT_KEY) === 'complete'
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
  const [mode, setMode] = useState<AppMode>(() => {
    if (requestedMode === 'hub') return 'hub'
    if (requestedMode === 'endless') return 'endless'
    if (requestedMode === 'boot') return 'boot'
    if (requestedMode === 'story') return 'story'
    return isBureauUnlocked(bureauProgress) ? 'hub' : 'story'
  })
  const [hubSection, setHubSection] = useState<HubSection>('case-board')
  const [endlessReturnTarget, setEndlessReturnTarget] = useState<'hub' | 'story'>(isBureauUnlocked(bureauProgress) ? 'hub' : 'story')
  const [bootOrigin, setBootOrigin] = useState<'hub' | 'endless-intro'>('endless-intro')
  const [storyResumeAccepted, setStoryResumeAccepted] = useState(() => {
    const pendingSeed = window.sessionStorage.getItem(CHEAT_AUTO_RESUME_KEY)
    if (pendingSeed !== String(initialSeed)) return false
    window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
    return true
  })
  const activeFormalRuntime = formalCaseRuntime(formalCaseId)
  const FormalCaseComponent = activeFormalRuntime.Component
  const storyResume = activeFormalRuntime.readResume(window.localStorage, formalCaseSeed)
  const savedEndlessSession = readEndlessSession(window.localStorage, dutySeed)
  const endlessResume = hasEndlessSessionProgress(savedEndlessSession) && savedEndlessSession ? {
    seed: savedEndlessSession.seed,
    historyCount: savedEndlessSession.history.length,
    remainingCredits: remainingEndlessAuditCredits(savedEndlessSession),
    solved: savedEndlessSession.solved,
  } : undefined

  const restartStory = () => {
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

  const openStoryFromHub = (caseId: FormalCaseId) => {
    const runtime = formalCaseRuntime(caseId)
    setFormalCaseId(caseId)
    setHubSection('case-board')
    setStoryResumeAccepted(Boolean(runtime.readResume(window.localStorage, formalCaseSeed)?.solved))
    setMode('story')
  }

  if (mode === 'hub') {
    return (
      <BureauHub
        section={hubSection}
        progress={bureauProgress}
        formalCaseResumes={storyResume ? { [formalCaseId]: storyResume } : undefined}
        endlessResume={endlessResume}
        dutySeed={dutySeed}
        onOpenStory={openStoryFromHub}
        onTraining={() => {
          setHubSection('training')
          setBootOrigin('hub')
          setMode('boot')
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
          setBootOrigin('endless-intro')
          setMode('boot')
        }}
        onSkip={() => setMode('endless')}
        onNewCase={() => {
          const nextSeed = dutySeed + 1
          clearEndlessSession(window.localStorage, dutySeed)
          clearEndlessSession(window.localStorage, nextSeed)
          setDutySeed(nextSeed)
          setMode('endless')
        }}
        backLabel={endlessReturnTarget === 'hub' ? '返回调查局' : '返回剧情案件'}
        onBack={() => setMode(endlessReturnTarget)}
      />
    )
  }

  if (mode === 'boot') {
    return <BootCase onComplete={() => {
      window.localStorage.setItem(ENDLESS_BOOT_KEY, 'complete')
      updateBureauProgress((current) => recordTrainingCaseCompletion(current, TRAINING_CASE_000.id))
      setMode(bootOrigin === 'hub' ? 'hub' : 'endless')
    }} onBack={() => setMode(bootOrigin === 'hub' ? 'hub' : 'endless-intro')} />
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

  if (mode === 'story' && storyResume && !storyResumeAccepted) {
    return (
      <FormalCaseResume
        definition={activeFormalRuntime.definition}
        summary={storyResume}
        onContinue={() => setStoryResumeAccepted(true)}
        onDiscard={() => {
          activeFormalRuntime.clearSession(window.localStorage, formalCaseSeed)
          setFormalCaseSession((value) => value + 1)
          setStoryResumeAccepted(true)
        }}
      />
    )
  }

  return (
    <FormalCaseComponent
      key={`${formalCaseId}-${formalCaseSeed}-${formalCaseSession}`}
      seed={formalCaseSeed}
      onRestart={restartStory}
      onCaseClosed={({ grade, score }) => updateBureauProgress((current) => recordFormalCaseResolution(current, formalCaseId, grade, score))}
      onReturnToBureau={isBureauUnlocked(bureauProgress) ? () => {
        setStoryResumeAccepted(false)
        setMode('hub')
      } : undefined}
    />
  )
}

export default App
