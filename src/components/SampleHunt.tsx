type Props = {
  selectedId?: string
  correct: boolean
  onClear?: () => void
}

export function SampleHunt({ selectedId, correct, onClear }: Props) {
  return (
    <section className={`sample-hunt ${correct ? 'solved' : ''}`} aria-label="异常旧样本调查">
      <span className="prompt-kicker">FIELD TASK // 02 / ODD SAMPLE</span>
      <h3>图里有旧样本“站错了队”</h3>
      <p>直接点散点图里一个最可疑的旧样本：它的图标属于一类，却明显落在另一类样本附近。</p>
      {!selectedId && <div className="sample-hunt-status">⌖ 等待你在左侧图上点一个样本</div>}
      {selectedId && !correct && (
        <div className="sample-hunt-status miss">
          <strong>这一个还不够反常。</strong>
          <span>它仍大致待在自己的群里。再找一个“混进对面阵营”的点。</span>
          {onClear && <button type="button" onClick={onClear}>重新标记</button>}
        </div>
      )}
      {correct && (
        <div className="sample-hunt-status hit">
          <strong>线索 02：旧数据自己就带着噪声。</strong>
          <span>如果模型死记每个旧点，它也会把这些偶然错误一起记住。</span>
        </div>
      )}
    </section>
  )
}
