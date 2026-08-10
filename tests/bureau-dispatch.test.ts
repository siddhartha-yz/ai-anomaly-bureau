import { describe, expect, it } from 'vitest'
import { bureauDispatch } from '../src/bureau/dispatch'
import { acknowledgeBureauInduction, createBureauProgress, recordBootCaseCompletion, recordDutyResolution, recordStory001Resolution } from '../src/bureau/progress'

function inducted() {
  return acknowledgeBureauInduction(recordStory001Resolution(createBureauProgress(), 'A', 90))
}

describe('Bureau shift dispatch', () => {
  it('keeps a trainee on the authored case board before induction', () => {
    expect(bureauDispatch(createBureauProgress())).toMatchObject({ target: 'case-board', code: 'INDUCTION' })
    expect(bureauDispatch(recordStory001Resolution(createBureauProgress(), 'A', 90))).toMatchObject({ target: 'case-board', title: '领取正式调查员证件' })
  })

  it('prioritizes an unfinished duty case over optional training', () => {
    const dispatch = bureauDispatch(inducted(), { seed: 6123, solved: false })
    expect(dispatch).toMatchObject({ target: 'duty', code: 'OPEN CASE' })
    expect(dispatch.title).toContain('6123')
  })

  it('recommends Training 000 once, without making it a hard gate', () => {
    const dispatch = bureauDispatch(inducted())
    expect(dispatch).toMatchObject({ target: 'training', code: 'TRAINING' })
    expect(dispatch.detail).toContain('不是正式案件的硬门槛')
  })

  it('uses only syndrome coverage count for field-work direction', () => {
    let progress = recordBootCaseCompletion(inducted())
    progress = recordDutyResolution(progress, { seed: 6000, syndrome: 'feature-gap', grade: 'A', score: 90, resolvedAt: '2026-08-10T00:00:00.000Z' })
    progress = recordDutyResolution(progress, { seed: 6004, syndrome: 'feature-gap', grade: 'S', score: 96, resolvedAt: '2026-08-10T00:10:00.000Z' })
    const dispatch = bureauDispatch(progress)
    expect(dispatch).toMatchObject({ target: 'duty', code: 'FIELD WORK', title: '陌生故障档案 1 / 4' })
    expect(dispatch.detail).not.toMatch(/特征不足|过拟合|分布|不平衡/)
  })

  it('hands a fully covered V1 investigator back to the archive', () => {
    let progress = recordBootCaseCompletion(inducted())
    for (const [index, syndrome] of (['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'] as const).entries()) {
      progress = recordDutyResolution(progress, { seed: 7000 + index, syndrome, grade: 'A', score: 90, resolvedAt: `2026-08-10T00:0${index}:00.000Z` })
    }
    expect(bureauDispatch(progress)).toMatchObject({ target: 'archive', code: 'ARCHIVE' })
  })
})
