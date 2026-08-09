import type { Stage } from '../game/types'

export type RewardNotice = {
  stage: Stage
  title: string
  detail: string
  tone: 'blue' | 'yellow'
}

export function StageReward({ notice }: { notice?: RewardNotice }) {
  if (!notice) return null
  return (
    <div className={`stage-reward reward-${notice.tone}`} role="status" aria-live="polite">
      <div className="reward-pixels" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>
      <span>PROGRESS +</span>
      <strong>{notice.title}</strong>
      <small>{notice.detail}</small>
    </div>
  )
}
