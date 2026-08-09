import { useEffect } from 'react'

export type PhaseTransitionCue = {
  phase: number
  code: string
  title: string
  detail: string
  tone: 'blue' | 'yellow'
}

export function PhaseTransition({ cue, onDismiss }: { cue?: PhaseTransitionCue; onDismiss: () => void }) {
  useEffect(() => {
    if (!cue) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cue, onDismiss])

  if (!cue) return null

  return (
    <div className={`phase-transition phase-transition-${cue.tone}`} role="status" aria-live="assertive">
      <div className="phase-transition-noise" aria-hidden="true" />
      <section className="phase-transition-terminal">
        <div className="phase-transition-head">
          <span>ANOMALY_BUREAU://PHASE_GATE</span>
          <i>ACCESS GRANTED</i>
        </div>
        <div className="phase-transition-code">PHASE {String(cue.phase).padStart(2, '0')}</div>
        <p className="phase-transition-command">&gt; {cue.code}</p>
        <h2>{cue.title}</h2>
        <p className="phase-transition-detail">{cue.detail}</p>
        <div className="phase-transition-loader" aria-hidden="true"><i /></div>
        <div className="phase-transition-status">
          <span>LINKING WORKSPACE...</span>
          <strong>READY</strong>
        </div>
      </section>
      <button type="button" className="phase-transition-skip" onClick={onDismiss}>ENTER / 跳过</button>
    </div>
  )
}
