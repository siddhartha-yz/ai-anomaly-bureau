export type FormalCaseDefinition = {
  id: string
  number: string
  title: string
  classification: string
  dispatchTime: string
  dispatchLocation: string
  incident: string
  objective: string
  assignment: string
  tags: readonly string[]
  icon: readonly [string, string, string]
  unlockAfter?: string
}

export type TrainingCaseDefinition = {
  id: string
  number: string
  title: string
  classification: string
  summary: string
}

export const STORY_CASE_001 = {
  id: 'story-001',
  number: '001',
  title: '失控的分类器',
  classification: 'SUPERVISED CLASSIFICATION INCIDENT',
  dispatchTime: '23:17',
  dispatchLocation: '校园北门',
  incident: '校园北门的识别器把一只橘猫判成了面包。',
  objective: '调查它从旧数据里学错了什么，并验证修复能否面对未知样本。',
  assignment: '新人入职案件',
  tags: ['剧情调查', '监督学习', '有限未知审计'],
  icon: ['CAT', '≠', 'BREAD'],
} as const satisfies FormalCaseDefinition

export const STORY_CASE_002 = {
  id: 'story-002',
  number: '002',
  title: '被平均数藏起来的人',
  classification: 'RARE-CLASS SCREENING INCIDENT',
  dispatchTime: '09:40',
  dispatchLocation: '校医院分诊站',
  incident: '分诊模型总体准确率超过 90%，却连续漏掉真正需要优先处理的少数病例。',
  objective: '拆开总体分数，找到被平均数掩盖的失败，并调整判定阈值满足安全约束。',
  assignment: '正式案件 · 指标审计',
  tags: ['剧情谜题', '分类别召回', '类别不平衡', '阈值取舍'],
  icon: ['92%', '≠', 'SAFE'],
  unlockAfter: STORY_CASE_001.id,
} as const satisfies FormalCaseDefinition

export const STORY_CASE_003 = {
  id: 'story-003',
  number: '003',
  title: '只在白天正确',
  classification: 'ENVIRONMENT SHIFT INCIDENT',
  dispatchTime: '21:12',
  dispatchLocation: '图书馆东门',
  incident: '白天验证几乎满分的门禁识别器，到了夜班后把一半通行者判错。',
  objective: '保持判断规则不变，只替换观察通道，找出跨环境仍稳定的证据。',
  assignment: '正式案件 · 环境迁移',
  tags: ['剧情谜题', '分布变化', '控制变量', '稳定特征'],
  icon: ['DAY', '→', 'NIGHT'],
  unlockAfter: STORY_CASE_002.id,
} as const satisfies FormalCaseDefinition

export const TRAINING_CASE_000 = {
  id: 'training-000',
  number: '000',
  title: '对照实验',
  classification: 'CONTROLLED INVESTIGATION DRILL',
  summary: '学习如何比较两条实验记录、一次只改变一个因素，以及“选中病因 ≠ 已经提交诊断”。',
} as const satisfies TrainingCaseDefinition

// Authored cases form a prerequisite chain: each case adds one investigation
// primitive and expects the player to reuse earlier ones, rather than acting as
// isolated tutorials.
export const FORMAL_CASE_CATALOG = [STORY_CASE_001, STORY_CASE_002, STORY_CASE_003] as const
export const TRAINING_CASE_CATALOG = [TRAINING_CASE_000] as const

export type FormalCaseId = (typeof FORMAL_CASE_CATALOG)[number]['id']
export type TrainingCaseId = (typeof TRAINING_CASE_CATALOG)[number]['id']

export function formalCaseCode(definition: FormalCaseDefinition) {
  return `CASE ${definition.number}`
}

export function trainingCaseCode(definition: TrainingCaseDefinition) {
  return `TRAINING ${definition.number}`
}
