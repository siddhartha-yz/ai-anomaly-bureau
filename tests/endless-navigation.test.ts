import { describe, expect, it } from 'vitest'
import { canInspectCaseLead, earnedCaseLeadReviewCount, objectiveFor } from '../src/endless/EndlessNavigator'
import type { EndlessRunRecord } from '../src/endless/uiTypes'

const record = (id: number): EndlessRunRecord => ({
  id,
  model: 'linear',
  features: ['warmth', 'roundness'],
  train: .9,
  test: .7,
  errors: 3,
  prediction: 'mid',
  predictionHit: true,
  recall: { cat: .7, bread: .7 },
  reliable: false,
})

describe('formal endless process navigator', () => {
  it('paces cause-source reviews by distinct experiment configurations, not audit grinding', () => {
    const baseline = record(1)
    const repeat = { ...record(2) }
    const fieldsOnly = { ...record(3), features: ['texture', 'aspect'] as ['texture', 'aspect'] }

    expect(earnedCaseLeadReviewCount([])).toBe(0)
    expect(earnedCaseLeadReviewCount([baseline])).toBe(1)
    expect(earnedCaseLeadReviewCount([baseline, repeat])).toBe(1)
    expect(earnedCaseLeadReviewCount([baseline, repeat, fieldsOnly])).toBe(2)

    expect(canInspectCaseLead([], 0, false)).toBe(false)
    expect(canInspectCaseLead([baseline], 0, false)).toBe(true)
    expect(canInspectCaseLead([baseline, repeat], 1, false)).toBe(false)
    expect(canInspectCaseLead([baseline, repeat], 1, true)).toBe(true)
    expect(canInspectCaseLead([baseline, repeat, fieldsOnly], 1, false)).toBe(true)
    expect(canInspectCaseLead([baseline, repeat, fieldsOnly], 2, false)).toBe(false)
  })

  it('starts with one baseline action rather than asking the player to diagnose', () => {
    const objective = objectiveFor({ trained: false, auditComplete: false, history: [], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 5 })
    expect(objective.focus).toBe('baseline')
    expect(objective.title).toContain('基线')
    expect(objective.detail).toContain('当前配置')
    expect(objective.target).toBe('train')
  })

  it('moves from train to prediction to choosing one causal lead before the next experiment', () => {
    const predict = objectiveFor({ trained: true, auditComplete: false, history: [], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 5 })
    expect(predict.focus).toBe('predict')
    expect(predict.title).toContain('预测')
    expect(predict.target).toBe('audit')

    const inspect = objectiveFor({ trained: true, auditComplete: true, history: [record(1)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 4 })
    expect(inspect.focus).toBe('review')
    expect(inspect.title).toContain('先决定查哪一种原因')
    expect(inspect.detail).toMatch(/档案构成|采集批次|质量记录/)
    expect(inspect.target).toBe('lead-board')

    const compare = objectiveFor({ trained: true, auditComplete: true, history: [record(1)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 4, inspectedCaseLeadCount: 1 })
    expect(compare.focus).toBe('configure')
    expect(compare.title).toContain('两个解释')
    expect(compare.detail).toContain('H-FIELDS')
    expect(compare.detail).toContain('H-MODEL')
    expect(compare.detail).toMatch(/只换字段|只换模型/)

    const skippedLead = objectiveFor({ trained: true, auditComplete: true, history: [record(1), record(2)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 3 })
    expect(skippedLead.focus).toBe('review')
    expect(skippedLead.target).toBe('lead-board')
    expect(skippedLead.title).toContain('先决定查哪一种原因')

    const needsFalsification = objectiveFor({ trained: true, auditComplete: true, history: [record(1), record(2)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 3, inspectedCaseLeadCount: 1, needsFalsification: true })
    expect(needsFalsification.focus).toBe('review')
    expect(needsFalsification.title).toContain('还没有排除竞争解释')
    expect(needsFalsification.detail).toMatch(/排除|不起作用|杀掉一个解释/)
  })

  it('moves from citing records to the diagnosis report without revealing an answer', () => {
    const cite = objectiveFor({ trained: true, auditComplete: true, history: [record(1), record(2)], diagnosisAvailable: true, evidenceReady: false, diagnosisLocked: false, credits: 3 })
    expect(cite.focus).toBe('diagnose')
    expect(cite.title).toContain('引用两条证据')
    expect(cite.target).toBe('run-log')

    const diagnose = objectiveFor({ trained: true, auditComplete: true, history: [record(1), record(2)], diagnosisAvailable: true, evidenceReady: true, diagnosisLocked: false, credits: 3 })
    expect(diagnose.focus).toBe('diagnose')
    expect(diagnose.title).toContain('形成病因判断')
    expect(diagnose.target).toBe('diagnosis')
    expect(`${cite.detail}${diagnose.detail}`).not.toMatch(/过拟合|特征不足|分布|类别不平衡/)
  })

  it('turns a locked diagnosis into a request for new evidence, never an answer hint', () => {
    const configure = objectiveFor({ trained: false, auditComplete: true, history: [record(1), record(2)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: true, credits: 3 })
    expect(configure.focus).toBe('configure')
    expect(configure.title).toContain('新的独立证据')

    const verify = objectiveFor({ trained: true, auditComplete: false, history: [record(1), record(2)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: true, credits: 3 })
    expect(verify.focus).toBe('predict')
    expect(verify.detail).toContain('正式审计')
    expect(`${configure.title}${configure.detail}${verify.title}${verify.detail}`).not.toMatch(/正确|过拟合|特征不足|分布漂移|少数类/)
  })

  it('points directly at recovery when a locked diagnosis has no audit credit left', () => {
    const recovery = objectiveFor({
      trained: true,
      auditComplete: true,
      history: [record(1), record(2), record(3), record(4), record(5)],
      diagnosisAvailable: false,
      evidenceReady: false,
      diagnosisLocked: true,
      credits: 0,
    })
    expect(recovery.focus).toBe('diagnose')
    expect(recovery.title).toContain('额度已经耗尽')
    expect(recovery.detail).toContain('补充审计')
    expect(recovery.target).toBe('recovery')
    expect(`${recovery.title}${recovery.detail}`).not.toMatch(/正确答案|过拟合|特征不足|分布漂移|类别不平衡/)
  })
})
