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
    <section className="pixel-mission-bar" aria-live="polite">
      <div className="mission-command">
        <span className="prompt-symbol">&gt;</span>
        <span className="mission-path">CASE001/{String(phase).padStart(2, '0')}</span>
        <strong>{content.step}</strong>
        <span className="cursor-block" />
      </div>
      <p>{content.task}</p>
      <div className="phase-pips" aria-label={`调查阶段 ${phase}/4`}>
        {PHASE_LABEL.map((label, index) => (
          <span className={index + 1 === phase ? 'active' : index + 1 < phase ? 'done' : ''} key={label}>
            <i>{index + 1 < phase ? '✓' : index + 1}</i>{label}
          </span>
        ))}
      </div>
    </section>
  )
}
