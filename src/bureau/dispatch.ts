import { formalCaseCode, STORY_CASE_001, trainingCaseCode, TRAINING_CASE_000 } from './catalog'
import type { BureauProgress } from './progress'

export type BureauDepartment = 'case-board' | 'training' | 'archive' | 'duty'

export type BureauDispatch = {
  target: BureauDepartment
  code: 'INDUCTION' | 'OPEN CASE' | 'TRAINING' | 'FIELD WORK' | 'ARCHIVE'
  title: string
  detail: string
  action: string
}

export type DutyResumeSummary = {
  seed: number
  solved: boolean
}

export function bureauDispatch(progress: BureauProgress, dutyResume?: DutyResumeSummary): BureauDispatch {
  if (!progress.story001.resolved) {
    return {
      target: 'case-board',
      code: 'INDUCTION',
      title: '完成新人入职案件',
      detail: '正式调查局权限尚未开放。',
      action: '查看案件板',
    }
  }

  if (!progress.inductionAcknowledged) {
    return {
      target: 'case-board',
      code: 'INDUCTION',
      title: '领取正式调查员证件',
      detail: `${formalCaseCode(STORY_CASE_001)} 已归档，先完成一次入职交接。`,
      action: '查看案件板',
    }
  }

  if (dutyResume && !dutyResume.solved) {
    return {
      target: 'duty',
      code: 'OPEN CASE',
      title: `CASE ${dutyResume.seed} 尚未结案`,
      detail: '值班室保留了你的实验记录与剩余审计额度。',
      action: '返回值班室',
    }
  }

  if (!progress.bootCase000.completed) {
    return {
      target: 'training',
      code: 'TRAINING',
      title: '训练中心有一份推荐练习',
      detail: `${trainingCaseCode(TRAINING_CASE_000)} 用两次真实实验练习控制变量；它不是正式案件的硬门槛。`,
      action: '前往训练中心',
    }
  }

  const knownSyndromes = new Set(progress.duty.resolutions.map((item) => item.syndrome)).size
  if (knownSyndromes < 4) {
    return {
      target: 'duty',
      code: 'FIELD WORK',
      title: `陌生故障档案 ${knownSyndromes} / 4`,
      detail: '值班室还有程序化异常报告。系统只分派工作，不会告诉你下一案是什么病因。',
      action: '查看值班报告',
    }
  }

  return {
    target: 'archive',
    code: 'ARCHIVE',
    title: '四类值班故障档案已齐',
    detail: '现有 V1 的方法练习已完整；案件板仍为后续正式调查保留位置。',
    action: '查看调查档案',
  }
}
