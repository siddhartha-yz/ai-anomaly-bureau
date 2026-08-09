import type { Stage } from '../game/types'

export type RewardNotice = {
  stage: Stage
  title: string
  detail: string
  tone: 'blue' | 'yellow'
  important?: boolean
}

export function StageReward({ notice, onDismiss }: { notice?: RewardNotice; onDismiss: () => void }) {
  if (!notice) return null
  return (
    <div className={`stage-reward reward-${notice.tone} ${notice.important ? 'important' : ''}`} role="status" aria-live="polite">
      <div className="reward-pixels" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>
      <button type="button" className="reward-close" onClick={onDismiss} aria-label="关闭进度提示">×</button>
      <span>{notice.important ? 'KEY PROGRESS +' : 'PROGRESS +'}</span>
      <strong>{notice.title}</strong>
      <small>{notice.detail}</small>
      <div className="reward-hold"><i /></div>
    </div>
  )
}
