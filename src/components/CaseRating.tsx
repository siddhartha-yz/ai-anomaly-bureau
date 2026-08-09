type Props = {
  experimentCount: number
  emergencyAudits: number
  hintLevel: number
  predictionHits: number
  predictionMisses: number
  trustedOldScore: boolean
  reasoningMisses: number
}

export function calculateCaseScore({ experimentCount, emergencyAudits, hintLevel, predictionHits, predictionMisses, trustedOldScore, reasoningMisses }: Props) {
  const extraExperiments = Math.max(0, experimentCount - 3)
  const score = Math.max(45, Math.min(100,
    100
      - emergencyAudits * 12
      - hintLevel * 4
      - predictionMisses * 6
      - reasoningMisses * 4
      - extraExperiments * 3
      - (trustedOldScore ? 5 : 0)
      + Math.min(6, predictionHits * 3),
  ))
  const flawlessProcess = !trustedOldScore
    && predictionMisses === 0
    && reasoningMisses === 0
    && emergencyAudits === 0
    && hintLevel === 0
    && experimentCount <= 3
  const grade = score >= 95 && flawlessProcess ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : 'C'
  return { score, grade }
}

export function CaseRating(props: Props) {
  const { score, grade } = calculateCaseScore(props)
  return (
    <section className="case-rating" aria-label={`调查评级 ${grade}`}>
      <div className="case-rating-grade"><small>INVESTIGATION RANK</small><strong>{grade}</strong><span>{score}/100</span></div>
      <div className="case-rating-breakdown">
        <span>正式方案 <b>{props.experimentCount}</b></span>
        <span>预测命中 <b>{props.predictionHits}</b></span>
        <span>预测偏差 <b>{props.predictionMisses}</b></span>
        <span>额外额度 <b>{props.emergencyAudits}</b></span>
        <span>推理修正 <b>{props.reasoningMisses}</b></span>
        <span>提示等级 <b>{props.hintLevel}</b></span>
      </div>
      <p>评级不奖励“旧样本最高分”，而奖励少量实验、可验证预测与未知数据上的稳定修复。</p>
    </section>
  )
}
