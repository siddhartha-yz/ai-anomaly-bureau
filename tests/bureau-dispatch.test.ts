import { describe, expect, it } from 'vitest'
import { STORY_CASE_001, STORY_CASE_002, STORY_CASE_003, TRAINING_CASE_000 } from '../src/bureau/catalog'
import { bureauDispatch } from '../src/bureau/dispatch'
import { acknowledgeBureauInduction, createBureauProgress, recordDutyResolution, recordFormalCaseResolution, recordTrainingCaseCompletion } from '../src/bureau/progress'

function inducted() {
  return acknowledgeBureauInduction(recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90))
}

function authoredComplete() {
  let progress = inducted()
  progress = recordFormalCaseResolution(progress, STORY_CASE_002.id, 'A', 90)
  progress = recordFormalCaseResolution(progress, STORY_CASE_003.id, 'A', 90)
  return progress
}

describe('Bureau shift dispatch', () => {
  it('keeps a trainee on the authored case board before induction', () => {
    expect(bureauDispatch(createBureauProgress())).toMatchObject({ target: 'case-board', code: 'INDUCTION' })
    expect(bureauDispatch(recordFormalCaseResolution(createBureauProgress(), STORY_CASE_001.id, 'A', 90))).toMatchObject({ target: 'case-board', title: '领取正式调查员证件' })
  })

  it('prioritizes an unfinished duty case over optional training', () => {
    const dispatch = bureauDispatch(inducted(), { seed: 6123, solved: false })
    expect(dispatch).toMatchObject({ target: 'duty', code: 'OPEN CASE' })
    expect(dispatch.title).toContain('6123')
  })

  it('prioritizes the next authored puzzle before optional training', () => {
    const case002 = bureauDispatch(inducted())
    expect(case002).toMatchObject({ target: 'case-board', code: 'OPEN CASE' })
    expect(case002.title).toContain('CASE 002')

    const after002 = recordFormalCaseResolution(inducted(), STORY_CASE_002.id, 'A', 90)
    expect(bureauDispatch(after002).title).toContain('CASE 003')
  })

  it('recommends Training 000 once after the current authored sequence, without making it a hard gate', () => {
    const dispatch = bureauDispatch(authoredComplete())
    expect(dispatch).toMatchObject({ target: 'training', code: 'TRAINING' })
    expect(dispatch.detail).toContain('不是正式案件的硬门槛')
  })

  it('uses only syndrome coverage count for field-work direction', () => {
    let progress = recordTrainingCaseCompletion(authoredComplete(), TRAINING_CASE_000.id)
    progress = recordDutyResolution(progress, { seed: 6000, syndrome: 'feature-gap', grade: 'A', score: 90, resolvedAt: '2026-08-10T00:00:00.000Z' })
    progress = recordDutyResolution(progress, { seed: 6004, syndrome: 'feature-gap', grade: 'S', score: 96, resolvedAt: '2026-08-10T00:10:00.000Z' })
    const dispatch = bureauDispatch(progress)
    expect(dispatch).toMatchObject({ target: 'duty', code: 'FIELD WORK', title: '陌生故障档案 1 / 4' })
    expect(dispatch.detail).not.toMatch(/特征不足|过拟合|分布|不平衡/)
  })

  it('hands a fully covered V1 investigator back to the archive', () => {
    let progress = recordTrainingCaseCompletion(authoredComplete(), TRAINING_CASE_000.id)
    for (const [index, syndrome] of (['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'] as const).entries()) {
      progress = recordDutyResolution(progress, { seed: 7000 + index, syndrome, grade: 'A', score: 90, resolvedAt: `2026-08-10T00:0${index}:00.000Z` })
    }
    expect(bureauDispatch(progress)).toMatchObject({ target: 'archive', code: 'ARCHIVE' })
  })
})
