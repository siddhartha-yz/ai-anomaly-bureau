export function EndlessIntro({ bootCompleted, onBoot, onSkip, onBack }: {
  bootCompleted: boolean
  onBoot: () => void
  onSkip: () => void
  onBack: () => void
}) {
  return (
    <main className="endless-intro-shell">
      <section className="endless-intro-card">
        <span className="endless-intro-kicker">SUPERVISED INVESTIGATION // MODE BRIEF</span>
        <h1>监督学习 · 无尽调查</h1>
        <p className="endless-intro-lead">这里没有固定解法路线。每起案件只给你症状、数据和有限的现场审计额度；你要自己设计实验，把不同解释一条条排除。</p>

        <div className="endless-loop-map" aria-label="无尽调查流程">
          <article><b>01</b><strong>配置观察</strong><span>只装两个字段，决定模型能看到什么。</span></article>
          <i>→</i>
          <article><b>02</b><strong>训练 + 预测</strong><span>先形成假设，再花额度验证现场。</span></article>
          <i>→</i>
          <article><b>03</b><strong>建立对照</strong><span>比较多次实验，而不是追一次最高分。</span></article>
          <i>→</i>
          <article><b>04</b><strong>提交诊断</strong><span>找到可靠方案，并解释系统为什么会坏。</span></article>
        </div>

        <div className="endless-intro-rules">
          <strong>正式模式不会替你解读证据。</strong>
          <span>系统只告诉你“下一步缺什么”，不会告诉你该选哪个字段、模型或病因。</span>
          <span>错误诊断允许发生，但要拿到新证据才能改口。</span>
        </div>

        <div className="endless-intro-actions">
          <button type="button" className="endless-intro-primary" onClick={bootCompleted ? onSkip : onBoot}>
            <small>{bootCompleted ? 'TRAINING COMPLETE' : 'RECOMMENDED FIRST'}</small>
            <strong>{bootCompleted ? '进入正式无尽调查' : '进行训练案件 000'}</strong>
          </button>
          <button type="button" className="endless-intro-secondary" onClick={bootCompleted ? onBoot : onSkip}>
            {bootCompleted ? '重玩训练案件 000' : '已熟悉流程？直接进入无尽调查'}
          </button>
          <button type="button" className="endless-intro-back" onClick={onBack}>返回剧情案件</button>
        </div>
      </section>
    </main>
  )
}
