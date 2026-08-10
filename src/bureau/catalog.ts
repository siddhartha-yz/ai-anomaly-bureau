export type FormalCaseDefinition = {
  id: 'story-001'
  number: '001'
  title: string
  classification: string
  dispatchTime: string
  dispatchLocation: string
  incident: string
  objective: string
  tags: readonly string[]
  icon: readonly [string, string, string]
}

export type TrainingCaseDefinition = {
  id: 'training-000'
  number: '000'
  title: string
  classification: string
  summary: string
}

export const STORY_CASE_001: FormalCaseDefinition = {
  id: 'story-001',
  number: '001',
  title: '失控的分类器',
  classification: 'SUPERVISED CLASSIFICATION INCIDENT',
  dispatchTime: '23:17',
  dispatchLocation: '校园北门',
  incident: '校园北门的识别器把一只橘猫判成了面包。',
  objective: '调查它从旧数据里学错了什么，并验证修复能否面对未知样本。',
  tags: ['剧情调查', '监督学习', '有限未知审计'],
  icon: ['CAT', '≠', 'BREAD'],
}

export const TRAINING_CASE_000: TrainingCaseDefinition = {
  id: 'training-000',
  number: '000',
  title: '对照实验',
  classification: 'CONTROLLED INVESTIGATION DRILL',
  summary: '学习如何比较两条实验记录、一次只改变一个因素，以及“选中病因 ≠ 已经提交诊断”。',
}

// V1 intentionally has one authored formal case. New authored cases must be
// registered here instead of being improvised inside the Hub or route layer.
export const FORMAL_CASE_CATALOG = [STORY_CASE_001] as const
export const TRAINING_CASE_CATALOG = [TRAINING_CASE_000] as const

export function formalCaseCode(definition: FormalCaseDefinition) {
  return `CASE ${definition.number}`
}

export function trainingCaseCode(definition: TrainingCaseDefinition) {
  return `TRAINING ${definition.number}`
}
