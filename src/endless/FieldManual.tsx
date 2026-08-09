export function FieldManual({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="field-manual-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="field-manual" role="dialog" aria-modal="true" aria-labelledby="field-manual-title">
        <header><span>FIELD MANUAL // PLAYER-OPENED</span><button type="button" onClick={onClose}>×</button></header>
        <h2 id="field-manual-title">调查手册</h2>
        <p>这不是答案表，只记录调查方法。正式案件不会自动替你套用这些规则。</p>
        <div className="field-manual-grid">
          <article><b>01</b><strong>先建立基线</strong><span>没有基线，就不知道后面的变化来自哪里。</span></article>
          <article><b>02</b><strong>一次尽量只改一个因素</strong><span>同时换字段又换模型，很难解释结果为什么变化。</span></article>
          <article><b>03</b><strong>先写下预测，再做审计</strong><span>实验不是开奖。预测能暴露你原先相信的假设。</span></article>
          <article><b>04</b><strong>复现 ≠ 对照</strong><span>同方案重跑能验证稳定性，但不会产生新的区分证据；想区分解释，要改变一个因素。</span></article>
          <article><b>05</b><strong>总体分只是摘要</strong><span>需要时检查分类别表现、错误样本与现场分布。</span></article>
          <article><b>06</b><strong>诊断要能解释证据</strong><span>如果新证据与诊断冲突，就重新设计实验，而不是轮流猜答案。</span></article>
        </div>
        <button type="button" className="field-manual-close" onClick={onClose}>返回案件</button>
      </section>
    </div>
  )
}
