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


export const STORY_CASE_004 = {
  id: 'story-004',
  number: '004',
  title: '验证集见过你',
  classification: 'DATA LEAKAGE INCIDENT',
  dispatchTime: '14:26',
  dispatchLocation: '校园回收分拣站',
  incident: '回收分类器的离线验证连续满分，但换一批从未出现过的真实物品后，准确率突然掉到接近猜测。',
  objective: '检查验证集是否真的独立，重做切分单位，再分辨“记住物品身份”和“学到可迁移规律”。',
  assignment: '正式案件 · 数据切分',
  tags: ['剧情谜题', '数据泄漏', '分组切分', '验证集独立性'],
  icon: ['VAL', '≠', 'NEW'],
  unlockAfter: STORY_CASE_003.id,
} as const satisfies FormalCaseDefinition


export const STORY_CASE_005 = {
  id: 'story-005',
  number: '005',
  title: '80% 到底是什么意思',
  classification: 'PROBABILITY CALIBRATION INCIDENT',
  dispatchTime: '09:40',
  dispatchLocation: '校医院分诊台',
  incident: '分诊模型的排序看起来合理，但医生发现“80% 风险”的病人并没有按 80% 的频率真正恶化，固定风险阈值因此做出了错误处置。',
  objective: '把“分得开”与“概率可信”拆开检查，在独立校准数据上修正概率，再保留真实风险阈值做决策。',
  assignment: '正式案件 · 概率校准',
  tags: ['剧情谜题', '概率校准', '可靠性图', '决策阈值'],
  icon: ['0.8', '≠', '80%'],
  unlockAfter: STORY_CASE_004.id,
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
export const FORMAL_CASE_CATALOG = [STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, STORY_CASE_005] as const
export const TRAINING_CASE_CATALOG = [TRAINING_CASE_000] as const

export type FormalCaseId = (typeof FORMAL_CASE_CATALOG)[number]['id']
export type TrainingCaseId = (typeof TRAINING_CASE_CATALOG)[number]['id']

export function formalCaseCode(definition: FormalCaseDefinition) {
  return `CASE ${definition.number}`
}

export function trainingCaseCode(definition: TrainingCaseDefinition) {
  return `TRAINING ${definition.number}`
}
