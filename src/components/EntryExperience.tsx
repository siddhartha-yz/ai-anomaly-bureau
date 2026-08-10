import { useEffect, useRef, useState } from 'react'
import { formalCaseCode, STORY_CASE_001 } from '../bureau/catalog'
import { PixelCat, PixelScanner } from './PixelScene'

export type EntryPhase = 'title' | 'incident' | 'boot' | 'game'

function TitleScene({ onStart, onBureau, audioEnabled }: { onStart: () => void; onBureau?: () => void; audioEnabled: boolean }) {
  const startRef = useRef(onStart)
  startRef.current = onStart

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button, a, input, select, textarea')) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        startRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="entry-scene" aria-label="AI异常调查局游戏开始画面">
      <div className="entry-night-sky" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="entry-city" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>

      <div className="entry-brand">
        <span className="entry-brand-code">ANOMALY BUREAU // TRAINING CASE</span>
        <h1 className="entry-pixel-title" aria-label="AI异常调查局">
          <span className="entry-title-ai">AI</span><span>异</span><span>常</span><span>调</span><span>查</span><span>局</span>
        </h1>
        <p className="entry-case">{formalCaseCode(STORY_CASE_001)} · {STORY_CASE_001.title}</p>
      </div>

      <section className="entry-story" aria-label="案件背景">
        <p className="entry-dispatch"><span>{STORY_CASE_001.dispatchTime}</span> {STORY_CASE_001.dispatchLocation}收到一条异常识别报告。</p>
        <div className="entry-incident-line">
          <strong>一只橘猫，被识别成了面包。</strong>
          <span>先亲眼看看事故，再决定怎么修。</span>
        </div>
      </section>

      <div className="entry-world" aria-hidden="true">
        <div className="entry-lamp lamp-one" /><div className="entry-lamp lamp-two" />
        <div className="entry-cat-character"><PixelCat /><span>?</span></div>
        <div className="entry-scanner-character"><PixelScanner /><div className="entry-scan-cone" /><span className="entry-glitch-output">BREAD?</span></div>
        <div className="entry-ground-line" />
      </div>

      <div className="entry-call-to-action">
        <button type="button" className="entry-start-button" onClick={onStart} autoFocus>
          <span className="entry-start-icon">▶</span>
          <span className="entry-start-copy"><small>STORY {formalCaseCode(STORY_CASE_001)}</small><strong>查看事故录像</strong></span>
          <kbd>ENTER</kbd>
        </button>
        <div className="entry-start-meta"><span>剧情案件 + 无尽调查</span><i>·</i><span>有限实验预算</span><i>·</i><span>{audioEnabled ? '♪ 8-BIT AUDIO ON' : 'AUDIO OFF'}</span></div>
      </div>

      {onBureau && <button type="button" className="entry-bureau-return" onClick={onBureau}>⌂ OFFICE / 返回调查局</button>}

      <div className="entry-xiaoxi-callout">
        <span className="entry-xiaoxi-pixel">析</span>
        <p><strong>小析：</strong>不用懂机器学习。先看一遍事故发生了什么。</p>
      </div>
    </main>
  )
}

function IncidentColdOpen({ onComplete }: { onComplete: () => void }) {
  const [beat, setBeat] = useState<0 | 1 | 2>(0)
  const advance = () => setBeat((current) => Math.min(2, current + 1) as 0 | 1 | 2)

  return (
    <main className={`incident-cold-open beat-${beat}`} aria-label="事故录像">
      <div className="cold-open-scanlines" aria-hidden="true" />
      <header className="cold-open-head">
        <span>REC // NORTH_GATE_CAM_04</span>
        <strong>23:17:08</strong>
        <i>● LIVE REPLAY</i>
      </header>

      <section className="cold-open-world" aria-label="机器人正在扫描一只橘猫">
        <div className="cold-open-ground" />
        <div className="cold-open-cat"><PixelCat /><span>橘猫</span></div>
        <div className="cold-open-scanner"><PixelScanner /><span>STRAY-VISION 2.1</span></div>
        <div className="cold-open-beam" aria-hidden="true" />
        <div className="cold-open-result" aria-live="polite">
          <small>MODEL OUTPUT</small>
          <strong>BREAD</strong>
          <span>CONFIDENCE 87%</span>
        </div>
      </section>

      <section className="cold-open-dialogue" aria-live="polite">
        {beat === 0 && (
          <>
            <span className="speaker human">HUMAN CHECK</span>
            <h2>你看到的是什么？</h2>
            <p>屏幕里只有一个明显能做的动作。先告诉系统最基本的事实。</p>
            <button type="button" className="cold-open-action" onClick={advance} autoFocus>▶ 这明明是一只猫</button>
          </>
        )}
        {beat === 1 && (
          <>
            <span className="speaker conflict">CONFLICT DETECTED</span>
            <div className="cold-open-conflict"><b>你：CAT</b><i>≠</i><b>机器人：BREAD</b></div>
            <h2>好，至少你的眼睛没坏。</h2>
            <p>小析：问题不是“它按错按钮”，而是它从以前的数据里学到了一个很糟的判断方法。</p>
            <button type="button" className="cold-open-action" onClick={advance} autoFocus>▶ 它到底学错了什么？</button>
          </>
        )}
        {beat === 2 && (
          <>
            <span className="speaker xiaoxi">XIAOXI // CONNECTED</span>
            <h2>这就是你的案件目标。</h2>
            <p><strong>找出它为什么把猫认成面包，然后让它面对没见过的新样本也能判断得住。</strong></p>
            <div className="cold-open-objectives">
              <span>01 看它以前见过什么</span><span>02 找到错误证据</span><span>03 修掉错误规律</span>
            </div>
            <button type="button" className="cold-open-action" onClick={onComplete} autoFocus>▶ 接入调查终端</button>
          </>
        )}
      </section>
    </main>
  )
}

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const completeRef = useRef(onComplete)
  const doneRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  completeRef.current = onComplete

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    if (timerRef.current) window.clearTimeout(timerRef.current)
    completeRef.current()
  }

  useEffect(() => {
    timerRef.current = window.setTimeout(finish, 1850)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') finish()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <main className="boot-sequence" aria-live="polite" aria-label="正在连接调查现场">
      <div className="boot-terminal">
        <div className="boot-logo">A<span>/</span>Δ</div>
        <div className="boot-copy">
          <p className="boot-line boot-line-1"><i>✓</i> CASE FILE 001 .................. LOADED</p>
          <p className="boot-line boot-line-2"><i>✓</i> SAMPLE ARCHIVE ................. LINKED</p>
          <p className="boot-line boot-line-3"><i>✓</i> XIAOXI ASSISTANT ............... ONLINE</p>
          <p className="boot-line boot-line-4"><i>▶</i> ENTERING INVESTIGATION SPACE...</p>
        </div>
        <div className="boot-progress"><i /></div>
        <strong className="boot-mission">INVESTIGATION START</strong>
      </div>
      <button type="button" className="boot-skip" onClick={finish}>ENTER / 跳过</button>
    </main>
  )
}

export function EntryExperience({ phase, onStart, onBureau, onIncidentComplete, onComplete, audioEnabled }: {
  phase: Exclude<EntryPhase, 'game'>
  onStart: () => void
  onBureau?: () => void
  onIncidentComplete: () => void
  onComplete: () => void
  audioEnabled: boolean
}) {
  if (phase === 'title') return <TitleScene onStart={onStart} onBureau={onBureau} audioEnabled={audioEnabled} />
  if (phase === 'incident') return <IncidentColdOpen onComplete={onIncidentComplete} />
  return <BootSequence onComplete={onComplete} />
}
