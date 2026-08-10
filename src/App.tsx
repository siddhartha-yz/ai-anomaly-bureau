import { useState } from 'react'
import { acknowledgeBureauInduction, readBureauProgress, reconcileLegacyProgress, recordBootCaseCompletion, recordDutyResolution, recordStory001Resolution, writeBureauProgress, type BureauProgress } from './bureau/progress'
import { BureauHub, type HubSection } from './components/BureauHub'
import { calculateCaseScore } from './components/CaseRating'
import { StoryResume } from './components/StoryResume'
import { STAGE_CONTENT } from './content/level1'
import { BootCase } from './endless/BootCase'
import { EndlessIntro } from './endless/EndlessIntro'
import { EndlessMode } from './endless/EndlessMode'
import { clearEndlessSession, hasEndlessSessionProgress, readEndlessSession, remainingEndlessAuditCredits } from './endless/session'
import { CHEAT_AUTO_RESUME_KEY } from './game/cheats'
import { clearStorySession, readStorySession, storyAuditCredits, storySessionHasProgress } from './game/session'
import { StoryCase001Runtime } from './story/StoryCase001Runtime'

const ENDLESS_BOOT_KEY = 'aia.boot-case-000.v2'

type AppMode = 'hub' | 'story' | 'endless-intro' | 'boot' | 'endless'

function App() {
  const params = new URLSearchParams(window.location.search)
  const initialSeed = Number(params.get('seed')) || 20260809
  const requestedMode = params.get('mode')
  const legacyBootCompleted = window.localStorage.getItem(ENDLESS_BOOT_KEY) === 'complete'
  const legacyStorySession = readStorySession(window.localStorage, initialSeed)
  const [bureauProgress, setBureauProgress] = useState<BureauProgress>(() => {
    let progress = readBureauProgress(window.localStorage)
    if (legacyStorySession?.state.stage === 'complete' && !progress.story001.resolved) {
      const hits = legacyStorySession.experimentLog.filter((record) => record.predictionMatched === true).length
      const misses = legacyStorySession.experimentLog.filter((record) => record.predictionMatched === false).length
      const rating = calculateCaseScore({
        experimentCount: legacyStorySession.experimentLog.length,
        emergencyAudits: legacyStorySession.emergencyAudits,
        hintLevel: legacyStorySession.state.hintLevel,
        predictionHits: hits,
        predictionMisses: misses,
        trustedOldScore: legacyStorySession.successPrediction === 'fixed',
        reasoningMisses: legacyStorySession.reasoningMisses,
      })
      progress = recordStory001Resolution(progress, rating.grade, rating.score)
    }
    progress = reconcileLegacyProgress(progress, {
      storyResolved: legacyStorySession?.state.stage === 'complete',
      bootCompleted: legacyBootCompleted,
    })
    writeBureauProgress(window.localStorage, progress)
    return progress
  })
  const [seed, setSeed] = useState(initialSeed)
  const [session, setSession] = useState(0)
  const [mode, setMode] = useState<AppMode>(() => {
    if (requestedMode === 'hub') return 'hub'
    if (requestedMode === 'endless') return 'endless'
    if (requestedMode === 'boot') return 'boot'
    if (requestedMode === 'story') return 'story'
    return bureauProgress.story001.resolved ? 'hub' : 'story'
  })
  const [hubSection, setHubSection] = useState<HubSection>('case-board')
  const [endlessReturnTarget, setEndlessReturnTarget] = useState<'hub' | 'story'>(bureauProgress.story001.resolved ? 'hub' : 'story')
  const [bootOrigin, setBootOrigin] = useState<'hub' | 'endless-intro'>('endless-intro')
  const [storyResumeAccepted, setStoryResumeAccepted] = useState(() => {
    const pendingSeed = window.sessionStorage.getItem(CHEAT_AUTO_RESUME_KEY)
    if (pendingSeed !== String(initialSeed)) return false
    window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
    return true
  })
  const savedStorySession = readStorySession(window.localStorage, seed)
  const storyResume = savedStorySession && storySessionHasProgress(savedStorySession) ? {
    stageLabel: STAGE_CONTENT[savedStorySession.state.stage].step,
    experimentCount: savedStorySession.experimentLog.length,
    remainingCredits: storyAuditCredits(savedStorySession),
    solved: savedStorySession.state.stage === 'complete',
  } : undefined
  const savedEndlessSession = readEndlessSession(window.localStorage, seed)
  const endlessResume = hasEndlessSessionProgress(savedEndlessSession) && savedEndlessSession ? {
    seed: savedEndlessSession.seed,
    historyCount: savedEndlessSession.history.length,
    remainingCredits: remainingEndlessAuditCredits(savedEndlessSession),
    solved: savedEndlessSession.solved,
  } : undefined

  const changeSeed = (nextSeed: number) => {
    setSeed(nextSeed)
    setSession((value) => value + 1)
  }

  const restartStory = () => {
    clearStorySession(window.localStorage, seed)
    setSession((value) => value + 1)
  }

  const updateBureauProgress = (update: (current: BureauProgress) => BureauProgress) => {
    setBureauProgress((current) => {
      const next = update(current)
      writeBureauProgress(window.localStorage, next)
      return next
    })
  }

  const openStoryFromHub = () => {
    setHubSection('case-board')
    setStoryResumeAccepted(Boolean(storyResume?.solved))
    setMode('story')
  }

  if (mode === 'hub') {
    return (
      <BureauHub
        section={hubSection}
        progress={bureauProgress}
        storyResume={storyResume}
        endlessResume={endlessResume}
        dutySeed={seed}
        onOpenStory={openStoryFromHub}
        onTraining={() => {
          setHubSection('training')
          setBootOrigin('hub')
          setMode('boot')
        }}
        onDuty={(dutySeed) => {
          setHubSection('duty')
          if (dutySeed !== seed) changeSeed(dutySeed)
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
        bootCompleted={bureauProgress.bootCase000.completed}
        resume={endlessResume}
        onBoot={() => {
          setBootOrigin('endless-intro')
          setMode('boot')
        }}
        onSkip={() => setMode('endless')}
        onNewCase={() => {
          const nextSeed = seed + 1
          clearEndlessSession(window.localStorage, seed)
          clearEndlessSession(window.localStorage, nextSeed)
          changeSeed(nextSeed)
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
      updateBureauProgress((current) => recordBootCaseCompletion(current))
      setMode(bootOrigin === 'hub' ? 'hub' : 'endless')
    }} onBack={() => setMode(bootOrigin === 'hub' ? 'hub' : 'endless-intro')} />
  }

  if (mode === 'endless') {
    return <EndlessMode
      initialSeed={seed}
      exitLabel={endlessReturnTarget === 'hub' ? '返回调查局' : '返回剧情案件'}
      onSeedChange={setSeed}
      onResolved={bureauProgress.story001.resolved ? (result) => updateBureauProgress((current) => recordDutyResolution(current, result)) : undefined}
      onExit={() => setMode(endlessReturnTarget)}
    />
  }

  if (mode === 'story' && storyResume && !storyResumeAccepted) {
    return (
      <StoryResume
        summary={storyResume}
        onContinue={() => setStoryResumeAccepted(true)}
        onDiscard={() => {
          clearStorySession(window.localStorage, seed)
          setSession((value) => value + 1)
          setStoryResumeAccepted(true)
        }}
      />
    )
  }

  return (
    <StoryCase001Runtime
      key={`${seed}-${session}`}
      seed={seed}
      onRestart={restartStory}
      onCaseClosed={({ grade, score }) => updateBureauProgress((current) => recordStory001Resolution(current, grade, score))}
      onReturnToBureau={bureauProgress.story001.resolved ? () => {
        setStoryResumeAccepted(false)
        setMode('hub')
      } : undefined}
    />
  )
}

export default App
