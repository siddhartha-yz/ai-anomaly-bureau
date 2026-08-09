import { describe, expect, it } from 'vitest'
import { objectiveFor } from '../src/endless/EndlessNavigator'
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
  it('starts with one baseline action rather than asking the player to diagnose', () => {
    const objective = objectiveFor({ trained: false, auditComplete: false, history: [], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 5 })
    expect(objective.focus).toBe('baseline')
    expect(objective.title).toContain('基线')
    expect(objective.detail).toContain('当前配置')
    expect(objective.target).toBe('train')
  })

  it('moves from train to prediction to a controlled next experiment', () => {
    const predict = objectiveFor({ trained: true, auditComplete: false, history: [], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 5 })
    expect(predict.focus).toBe('predict')
    expect(predict.title).toContain('预测')
    expect(predict.target).toBe('audit')

    const compare = objectiveFor({ trained: true, auditComplete: true, history: [record(1)], diagnosisAvailable: false, evidenceReady: false, diagnosisLocked: false, credits: 4 })
    expect(compare.focus).toBe('configure')
    expect(compare.title).toContain('对照')
    expect(compare.detail).toContain('只改变一个因素')
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
