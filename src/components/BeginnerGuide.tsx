import type { Stage } from '../game/types'

const GUIDE: Record<Stage, { title: string; line: string; cue: string }> = {
  briefing: {
    title: '接下案件',
    line: '先进去看看发生了什么。',
    cue: '接受事故调查',
  },
  inspect_data: {
    title: '只看左边',
    line: '橘猫和面包，是不是大致分成了两团？',
    cue: '我看到了',
  },
  choose_features: {
    title: '换观察方式',
    line: '点 X / Y，再选一个特征。',
    cue: '让模型看这两项',
  },
  choose_model: {
    title: '先选最简单的',
    line: '装载直线分类器。',
    cue: '使用这个模型',
  },
  train: {
    title: '训练一次',
    line: '看看模型会怎么切开左边的空间。',
    cue: '开始训练',
  },
  first_success: {
    title: '别急着庆祝',
    line: '旧样本不错。现在换没见过的数据。',
    cue: '接受未知挑战',
  },
  hidden_test: {
    title: '放入新样本',
    line: '这批数据没有参与训练。',
    cue: '运行未知审计',
  },
  inspect_errors: {
    title: '抓一个错误',
    line: '点击图里闪黄的「!」。',
    cue: '查看误判',
  },
  iterate: {
    title: '重新设计',
    line: '换特征或模型，再训练、再审计。',
    cue: '修改当前方案',
  },
  overfit_reveal: {
    title: '训练满分也会失败',
    line: '它记住了旧题，却没学会新题。',
    cue: '重新设计',
  },
  final_audit: {
    title: '修复通过',
    line: '新样本也稳定了。',
    cue: '进入最后一问',
  },
  transfer_question: {
    title: '最后一问',
    line: '按刚才真正做过的事判断。',
    cue: '提交调查报告',
  },
  complete: {
    title: '案件关闭',
    line: 'CASE 001 已完成。',
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
  action?: React.ReactNode
}) {
  const guide = GUIDE[stage]
  return (
    <aside className={`beginner-guide ${compact ? 'compact' : ''} ${action ? 'with-action' : ''}`} aria-live="polite">
      <div className="guide-icon" aria-hidden="true">!</div>
      <div className="guide-copy">
        <span>MISSION</span>
        <strong>{guide.title}</strong>
        <p>{guide.line}</p>
      </div>
      {action ? <div className="guide-action">{action}</div> : <div className="guide-cue">▶ {guide.cue}</div>}
    </aside>
  )
}
