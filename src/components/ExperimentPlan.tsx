export type ExperimentPrediction = 'both-improve' | 'train-up-test-down' | 'test-improves' | 'no-idea'

type Props = {
  phase: 'trap' | 'repair'
  value?: ExperimentPrediction
  credits: number
  onChange: (value: ExperimentPrediction) => void
  onEmergencyCredit?: () => void
}

const OPTIONS: Record<Props['phase'], Array<{ id: ExperimentPrediction; label: string }>> = {
  trap: [
    { id: 'both-improve', label: '旧样本更高，新样本也会更高' },
    { id: 'train-up-test-down', label: '旧样本可能满分，但新样本反而更差' },
    { id: 'no-idea', label: '我不确定，先记录为未知' },
  ],
  repair: [
    { id: 'test-improves', label: '旧样本未必满分，但新样本应该明显改善' },
    { id: 'both-improve', label: '旧样本和新样本都应该一起更高' },
    { id: 'no-idea', label: '我不确定，先记录为未知' },
  ],
}

export function ExperimentPlan({ phase, value, credits, onChange, onEmergencyCredit }: Props) {
  return (
    <section className="experiment-plan" aria-label="实验前预测">
      <div className="experiment-plan-head">
        <span>EXPERIMENT PROTOCOL</span>
        <strong>正式审计额度：{credits}</strong>
      </div>
      <h3>先下注，再做实验。</h3>
      <p>{phase === 'trap'
        ? '你准备让 k=1 尽量贴住旧样本。先预测：训练分变高以后，未知样本会怎样？'
        : '你准备根据证据换观察方式。先预测：这次真正应该改善的是哪一边？'}</p>
      {credits > 0 ? (
        <div className="experiment-predictions">
          {OPTIONS[phase].map((option) => (
            <button
              type="button"
              key={option.id}
              className={value === option.id ? 'selected' : ''}
              aria-pressed={value === option.id}
              onClick={() => onChange(option.id)}
            >
              <i>?</i><span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="experiment-budget-empty">
          <strong>正式额度耗尽。</strong>
          <span>案件不会死锁，但申请额外实验会降低调查评级。</span>
          {onEmergencyCredit && <button type="button" onClick={onEmergencyCredit}>申请 1 次额外审计</button>}
        </div>
      )}
      {value && credits > 0 && <div className="experiment-plan-lock">PREDICTION LOCKED // 现在去训练，再用未知样本验证。</div>}
    </section>
  )
}
