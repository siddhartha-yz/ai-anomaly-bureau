import { STAGE_CONTENT } from '../content/level1'
import type { Stage } from '../game/types'

const PHASE: Record<Stage, number> = {
  briefing: 1,
  inspect_data: 1,
  choose_features: 1,
  choose_model: 1,
  train: 1,
  first_success: 1,
  hidden_test: 2,
  inspect_errors: 2,
  iterate: 3,
  overfit_reveal: 3,
  final_audit: 3,
  transfer_question: 4,
  complete: 4,
}

const PHASE_LABEL = ['现场取证', '未知审计', '系统修复', '结案复盘']

export function TaskBanner({ stage }: { stage: Stage }) {
  const content = STAGE_CONTENT[stage]
  const phase = PHASE[stage]

  return (
    <section className="pixel-objective-strip" aria-live="polite">
      <div className="objective-badge">
        <small>OBJECTIVE</small>
        <strong>{String(phase).padStart(2, '0')}</strong>
      </div>
      <div className="objective-main">
        <div className="objective-meta">
          <span>{content.role}</span>
          <i>/</i>
          <strong>{content.step}</strong>
        </div>
        <p>{content.task}</p>
      </div>
      <div className="pixel-phase-track" aria-label={`调查阶段 ${phase}/4`}>
        {PHASE_LABEL.map((label, index) => {
          const number = index + 1
          const stateClass = number === phase ? 'active' : number < phase ? 'done' : ''
          return (
            <span className={stateClass} key={label}>
              <i>{number < phase ? '✓' : number}</i>
              <small>{label}</small>
            </span>
          )
        })}
      </div>
    </section>
  )
}
