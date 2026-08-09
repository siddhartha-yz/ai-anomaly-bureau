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

const PHASES = [
  { id: 1, code: '01', label: '现场取证' },
  { id: 2, code: '02', label: '未知审计' },
  { id: 3, code: '03', label: '系统修复' },
  { id: 4, code: '04', label: '结案复盘' },
] as const

export function TaskBanner({ stage }: { stage: Stage }) {
  const content = STAGE_CONTENT[stage]
  const phase = PHASE[stage]

  return (
    <section className="mission-hud" aria-live="polite">
      <div className="mission-progress" aria-label={`调查进度，第 ${phase} 阶段，共 4 阶段`}>
        {PHASES.map((item) => (
          <div
            className={`phase-node ${item.id === phase ? 'active' : ''} ${item.id < phase ? 'done' : ''}`}
            key={item.id}
          >
            <span className="phase-code">{item.id < phase ? '✓' : item.code}</span>
            <span className="phase-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="mission-objective">
        <div className="objective-marker">
          <span className="objective-pulse" />
          CURRENT OBJECTIVE
        </div>
        <div className="objective-copy">
          <div>
            <span className="role-chip">{content.role}</span>
            <span className="step-chip">{content.step}</span>
          </div>
          <p>{content.task}</p>
        </div>
      </div>
    </section>
  )
}
