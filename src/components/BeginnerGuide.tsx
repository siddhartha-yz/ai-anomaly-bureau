import type { ReactNode } from 'react'
import type { Stage } from '../game/types'

const GUIDE: Record<Stage, { title: string; body: string; cue: string }> = {
  briefing: {
    title: '先做这一件事',
    body: '先接下案件。你暂时不用理解任何模型，也不用改参数。',
    cue: '点「接受事故调查」',
  },
  inspect_data: {
    title: '只看左边的图',
    body: '先别管右边。观察橘猫和面包各自聚在哪里：它们是不是大致分成了两团？',
    cue: '看完后告诉小析：我找到了一些规律',
  },
  choose_features: {
    title: '现在只改观察方式',
    body: '点 X 或 Y 槽，再装入一个特征。目标只有一个：让橘猫和面包更容易分开。',
    cue: '先换两个传感器，再确认方案',
  },
  choose_model: {
    title: '只选一个判断工具',
    body: '先从直线分类器开始。复杂度不是分数，模型更复杂也不代表更好。',
    cue: '装载直线分类器',
  },
  train: {
    title: '现在让模型动起来',
    body: '暂时别改别的。训练一次，看左边的扫描空间会被怎样划分。',
    cue: '启动第一次训练',
  },
  first_success: {
    title: '先别庆功',
    body: '旧样本表现不错，但这只能说明它会做见过的题。真正的检查还没开始。',
    cue: '接受未知样本挑战',
  },
  hidden_test: {
    title: '把新样本放进来',
    body: '这批数据从未参与训练。现在只需要让当前模型接受一次现场抽查。',
    cue: '运行未知样本审计',
  },
  inspect_errors: {
    title: '先抓住一个错误',
    body: '别先盯总分。左边闪黄的「!」就是误判证据，点开任意一个。',
    cue: '点击黄色误判',
  },
  iterate: {
    title: '按这个顺序修',
    body: '换特征或模型 → 训练 → 再审计。比较旧样本和未知样本，不要只追 100%。',
    cue: '修改方案后重新训练',
  },
  overfit_reveal: {
    title: '记住刚才这个陷阱',
    body: '训练 100%，新数据却更差：它记住了旧题，而不是学会了真正的规律。',
    cue: '重新设计方案',
  },
  final_audit: {
    title: '修复已经站住了',
    body: '这次不是训练分最高，而是未知样本也稳定。你已经真正解决了事故。',
    cue: '进入最后一问',
  },
  transfer_question: {
    title: '最后只考一个直觉',
    body: '不用背定义。把刚才处理这起事故的经验迁移到另一个模型问题。',
    cue: '选择答案并提交报告',
  },
  complete: {
    title: '案件关闭',
    body: '你已经亲手经历：观察数据、选择特征、训练、测试、查错、修复。',
    cue: 'CASE CLOSED',
  },
}

export function BeginnerGuide({
  stage,
  compact = false,
  action,
}: {
  stage: Stage
  compact?: boolean
  action?: ReactNode
}) {
  const guide = GUIDE[stage]
  return (
    <aside className={`beginner-guide ${compact ? 'compact' : ''} ${action ? 'with-action' : ''}`} aria-live="polite">
      <div className="guide-icon" aria-hidden="true">!</div>
      <div className="guide-copy">
        <span>MISSION ORDER</span>
        <strong>{guide.title}</strong>
        <p>{guide.body}</p>
      </div>
      {action ? (
        <div className="guide-action">{action}</div>
      ) : (
        <div className="guide-cue">▶ {guide.cue}</div>
      )}
    </aside>
  )
}
