type Props = {
  prediction?: string
  accuracy: number
  errors: number
}

export function PredictionOutcome({ prediction, accuracy, errors }: Props) {
  const trustedOldScore = prediction === 'fixed'
  return (
    <section className={`prediction-outcome ${trustedOldScore ? 'bad-call' : 'cautious-call'}`} aria-label="第一次预测结果">
      <div className="prediction-outcome-head">
        <span>FIELD REPLAY // DECISION CONSEQUENCE</span>
        <strong>{trustedOldScore ? '临时放行记录' : '沙盒审计记录'}</strong>
      </div>
      {trustedOldScore ? (
        <>
          <h3>你刚才相信了 89%，机器人被临时放回现场。</h3>
          <div className="incident-ticker">
            <span>CAT → BREAD</span><span>BREAD → CAT</span><span>CAT → BREAD</span>
          </div>
          <p>随后抽查到 <b>{errors}</b> 个误判，未知样本只有 <b>{Math.round(accuracy * 100)}%</b>。错误判断没有让你失败，但它现在变成了一条案件证据。</p>
        </>
      ) : (
        <>
          <h3>你没有批准上线，而是先要求未知样本审计。</h3>
          <p>这个决定在沙盒里拦下了 <b>{errors}</b> 个误判：未知样本只有 <b>{Math.round(accuracy * 100)}%</b>。现在去看错误本身，而不是只看数字。</p>
        </>
      )}
    </section>
  )
}
