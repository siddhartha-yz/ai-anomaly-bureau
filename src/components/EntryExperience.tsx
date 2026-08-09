import { useEffect, useRef } from 'react'
import { PixelCat, PixelScanner } from './PixelScene'

export type EntryPhase = 'title' | 'boot' | 'game'

function TitleScene({ onStart, audioEnabled }: { onStart: () => void; audioEnabled: boolean }) {
  const startRef = useRef(onStart)
  startRef.current = onStart

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      <div className="entry-night-sky" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      <div className="entry-city" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>

      <div className="entry-brand">
        <span className="entry-brand-code">ANOMALY BUREAU // TRAINING CASE</span>
        <h1 className="entry-pixel-title" aria-label="AI异常调查局">
          <span className="entry-title-ai">AI</span>
          <span>异</span><span>常</span><span>调</span><span>查</span><span>局</span>
        </h1>
        <p className="entry-case">CASE 001 · 失控的分类器</p>
      </div>

      <section className="entry-story" aria-label="案件背景">
        <p className="entry-dispatch"><span>23:17</span> 校园北门收到一条异常识别报告。</p>
        <div className="entry-incident-line">
          <strong>一只橘猫，被识别成了面包。</strong>
          <span>机器人很自信。问题出在哪？</span>
        </div>
      </section>

      <div className="entry-world" aria-hidden="true">
        <div className="entry-lamp lamp-one" />
        <div className="entry-lamp lamp-two" />
        <div className="entry-cat-character">
          <PixelCat />
          <span>?</span>
        </div>
        <div className="entry-scanner-character">
          <PixelScanner />
          <div className="entry-scan-cone" />
          <span className="entry-glitch-output">BREAD?</span>
        </div>
        <div className="entry-ground-line" />
      </div>

      <div className="entry-call-to-action">
        <button type="button" className="entry-start-button" onClick={onStart} autoFocus>
          <span className="entry-start-icon">▶</span>
          <span className="entry-start-copy">
            <small>NEW CASE AVAILABLE</small>
            <strong>进入调查现场</strong>
          </span>
          <kbd>ENTER</kbd>
        </button>
        <div className="entry-start-meta">
          <span>不需要公式</span>
          <i>·</i>
          <span>约 15–30 分钟</span>
          <i>·</i>
          <span>{audioEnabled ? '♪ 8-BIT AUDIO ON' : 'AUDIO OFF'}</span>
        </div>
      </div>

      <div className="entry-xiaoxi-callout">
        <span className="entry-xiaoxi-pixel">析</span>
        <p><strong>小析：</strong>先别想机器学习是什么。进去看看它到底看见了什么。</p>
      </div>
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
          <p className="boot-line boot-line-2"><i>✓</i> FIELD DATA ..................... LINKED</p>
          <p className="boot-line boot-line-3"><i>✓</i> XIAOXI ASSISTANT ............... ONLINE</p>
          <p className="boot-line boot-line-4"><i>▶</i> ENTERING INVESTIGATION SPACE...</p>
        </div>
        <div className="boot-progress"><i /></div>
        <strong className="boot-mission">MISSION START</strong>
      </div>
      <button type="button" className="boot-skip" onClick={finish}>ENTER / 跳过</button>
    </main>
  )
}

export function EntryExperience({
  phase,
  onStart,
  onComplete,
  audioEnabled,
}: {
  phase: Exclude<EntryPhase, 'game'>
  onStart: () => void
  onComplete: () => void
  audioEnabled: boolean
}) {
  return phase === 'title'
    ? <TitleScene onStart={onStart} audioEnabled={audioEnabled} />
    : <BootSequence onComplete={onComplete} />
}
