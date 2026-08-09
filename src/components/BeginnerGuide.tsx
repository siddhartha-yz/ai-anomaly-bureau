import type { Stage } from '../game/types'

const GUIDE: Record<Stage, { title: string; body: string; cue: string }> = {
  briefing: {
    title: '先做这一件事',
    body: '先接下案件。你暂时不用理解任何模型，也不用改参数。',
    cue: '点「接受事故调查」',
  },
  inspect_data: {
    title: '只看左边的图',
    body: '先观察猫和面包各自聚在哪里。别急着选模型。',
    cue: '看完后点「我找到了一些规律」',
  },
  choose_features: {
    title: '决定机器人能看见什么',
    body: '先点 X 或 Y 槽，再装入一个特征。目标是让两类样本更容易分开。',
    cue: '尝试更换两个传感器',
  },
  choose_model: {
    title: '从最简单的工具开始',
    body: '先选直线分类器。模型越复杂不代表越好。',
    cue: '装载「直线分类器」',
  },
  train: {
    title: '让模型第一次动起来',
    body: '现在只需要训练一次，看看它如何划分左边的空间。',
    cue: '点「训练模型并画出边界」',
  },
  first_success: {
    title: '旧样本过关，不代表真的会了',
    body: '训练结果不错。下一步才是真正的现场抽查。',
    cue: '接受未知样本挑战',
  },
  hidden_test: {
    title: '让没见过的样本进场',
    body: '这批数据从没参与训练。它们更能检验模型是否真的学会。',
    cue: '点「运行未知样本审计」',
  },
  inspect_errors: {
    title: '别先盯总分，先抓一个错误',
    body: '图里闪黄的「!」就是误判证据。点开一个，看看它为什么被骗。',
    cue: '点击任意黄色误判',
  },
  iterate: {
    title: '修复的顺序很简单',
    body: '换特征或模型 → 训练 → 再审计。比较旧样本和未知样本，不要只追 100%。',
    cue: '修改方案后重新训练',
  },
  overfit_reveal: {
    title: '你刚撞上了一个经典陷阱',
    body: '训练 100% 但新数据变差：它记住了旧题，却没有真正学会规律。',
    cue: '记住这个现象，然后重新设计',
  },
  final_audit: {
    title: '修复通过',
    body: '这次不是训练分最高，而是新样本也稳定。你已经真正解决了事故。',
    cue: '进入最后一问',
  },
  transfer_question: {
    title: '最后只考一个直觉',
    body: '不用背定义。把刚才处理这起事故的经验迁移到新场景。',
    cue: '选择答案并提交报告',
  },
  complete: {
    title: '案件关闭',
    body: '你已经亲手经历：观察数据、选择特征、训练、测试、查错、修复。',
    cue: 'CASE CLOSED',
  },
}

export function BeginnerGuide({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  const guide = GUIDE[stage]
  return (
    <aside className={`beginner-guide ${compact ? 'compact' : ''}`} aria-live="polite">
      <div className="guide-icon" aria-hidden="true">!</div>
      <div className="guide-copy">
        <span>NEW AGENT GUIDE</span>
        <strong>{guide.title}</strong>
        <p>{guide.body}</p>
      </div>
      <div className="guide-cue">▶ {guide.cue}</div>
    </aside>
  )
}
