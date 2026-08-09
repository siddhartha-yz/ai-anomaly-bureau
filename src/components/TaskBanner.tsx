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

export function TaskBanner({ stage }: { stage: Stage }) {
  const content = STAGE_CONTENT[stage]
  return (
    <section className="task-banner" aria-live="polite">
      <div className="task-kicker">
        <span>{content.role}</span>
        <span>阶段 {PHASE[stage]}/4 · {content.step}</span>
      </div>
      <p>{content.task}</p>
    </section>
  )
}
