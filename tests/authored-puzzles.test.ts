import { describe, expect, it } from 'vitest'
import { STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, STORY_CASE_005 } from '../src/bureau/catalog'
import { AUTHORED_PUZZLE_CASES, evaluateCalibration, evaluateLeakageModel, evaluateLeakageSplit, evaluateScreeningThreshold, evaluateShiftSensor } from '../src/story/authoredCasePuzzles'
import { puzzleCaseScore } from '../src/story/StoryPuzzleRuntime'
import { clearPuzzleSession, createPuzzleCheatSession, puzzleSessionHasProgress, puzzleSessionKey, readPuzzleSession, writePuzzleSession, type PuzzleSession } from '../src/story/puzzleSession'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('authored CASE 002 / 003 puzzle progression', () => {
  it('turns class imbalance into a threshold constraint puzzle instead of an accuracy lecture', () => {
    const conservative = evaluateScreeningThreshold(.8)
    const edgeSafe = evaluateScreeningThreshold(.6)
    const balanced = evaluateScreeningThreshold(.55)
    const overSensitive = evaluateScreeningThreshold(.35)

    expect(conservative.accuracy).toBeGreaterThan(.9)
    expect(conservative.urgentRecall).toBe(.25)
    expect(edgeSafe.accuracy).toBeGreaterThanOrEqual(.8)
    expect(edgeSafe.urgentRecall).toBe(.75)
    expect(balanced.accuracy).toBeGreaterThanOrEqual(.8)
    expect(balanced.urgentRecall).toBe(1)
    expect(overSensitive.urgentRecall).toBe(1)
    expect(overSensitive.accuracy).toBeLessThan(.8)

    const thresholdStage = AUTHORED_PUZZLE_CASES[STORY_CASE_002.id].stages.find((stage) => stage.id === 'threshold')
    expect(thresholdStage?.correctIds).toEqual(['t60', 't55'])
  })

  it('makes CASE 003 reuse per-class reliability while isolating environment-sensitive sensors', () => {
    const brightness = evaluateShiftSensor('brightness')
    const texture = evaluateShiftSensor('texture')
    const shape = evaluateShiftSensor('shape')

    expect(brightness.historyAccuracy).toBe(1)
    expect(brightness.fieldAccuracy).toBe(.5)
    expect(brightness.minFieldRecall).toBe(0)
    expect(texture.fieldAccuracy).toBeGreaterThanOrEqual(.8)
    expect(texture.minFieldRecall).toBeGreaterThanOrEqual(.75)
    expect(shape.fieldAccuracy).toBe(1)
    expect(shape.minFieldRecall).toBe(1)

    const sensorStage = AUTHORED_PUZZLE_CASES[STORY_CASE_003.id].stages.find((stage) => stage.id === 'stable-sensor')
    expect(sensorStage?.correctIds).toEqual(['texture', 'shape'])
  })


  it('makes CASE 004 expose validation leakage by changing the split unit before changing the model', () => {
    const record = evaluateLeakageSplit('record')
    const day = evaluateLeakageSplit('day')
    const entity = evaluateLeakageSplit('entity')
    expect(record.identityOverlap).toBe(1)
    expect(record.validationAccuracy).toBe(1)
    expect(day.identityOverlap).toBe(.5)
    expect(day.validationAccuracy).toBe(.75)
    expect(entity.identityOverlap).toBe(0)
    expect(entity.validationAccuracy).toBe(.5)
    expect(entity.minValidationRecall).toBe(0)

    const identity = evaluateLeakageModel('identity')
    const stable = evaluateLeakageModel('stable')
    const camera = evaluateLeakageModel('camera')
    expect(identity.validationAccuracy).toBe(.5)
    expect(identity.minValidationRecall).toBe(0)
    expect(stable.validationAccuracy).toBe(.875)
    expect(stable.minValidationRecall).toBe(.75)
    expect(camera.validationAccuracy).toBe(0)

    const resplit = AUTHORED_PUZZLE_CASES[STORY_CASE_004.id].stages.find((stage) => stage.id === 'resplit')
    const model = AUTHORED_PUZZLE_CASES[STORY_CASE_004.id].stages.find((stage) => stage.id === 'clean-model')
    const provenance = AUTHORED_PUZZLE_CASES[STORY_CASE_004.id].stages.find((stage) => stage.id === 'provenance')
    expect(provenance?.correctIds).toEqual(['obj-09'])
    expect(provenance?.evidence?.rows.filter((row) => row[1] === 'OBJ-09').map((row) => row[2])).toEqual(['TRAIN', 'VALIDATION'])
    expect(resplit?.correctIds).toEqual(['entity'])
    expect(model?.correctIds).toEqual(['stable'])
  })

  it('makes CASE 005 separate ranking from probability calibration before reusing a fixed risk policy', () => {
    expect(evaluateCalibration('raw').ece).toBeCloseTo(.09)
    expect(evaluateCalibration('raw').brier).toBeCloseTo(.158)
    expect(evaluateCalibration('calibrated').ece).toBeCloseTo(.03)
    expect(evaluateCalibration('calibrated').brier).toBeCloseTo(.15)
    expect(evaluateCalibration('hard').ece).toBeCloseTo(.21)
    expect(evaluateCalibration('hard').brier).toBeCloseTo(.21)
    const config = AUTHORED_PUZZLE_CASES[STORY_CASE_005.id]
    expect(config.stages.map((stage) => stage.id)).toEqual(['reliability', 'calibrate', 'policy'])
    expect(config.stages[0].evidence?.rows).toEqual([
      ['20%', '25', '8%'], ['40%', '25', '36%'], ['60%', '25', '68%'], ['80%', '25', '92%'],
    ])
    expect(config.stages[1].evidence?.columns).toEqual(['RAW SCORE', 'PATIENTS', 'OBSERVED'])
    expect(config.stages[1].evidence?.rows).toEqual([
      ['20%', '10', '10%'], ['40%', '10', '30%'], ['60%', '10', '70%'], ['80%', '10', '90%'],
    ])
    expect(config.stages[1].evidence?.columns).not.toContain('FITTED OUTPUT')
    expect(config.stages[1].correctIds).toEqual(['calibrated'])
    expect(config.stages[2].correctIds).toEqual(['calibrated-policy'])
  })

  it('persists compact case-specific checkpoints and rejects mismatched case identities', () => {
    const storage = new MemoryStorage()
    const session: PuzzleSession = {
      version: 1,
      caseId: STORY_CASE_002.id,
      seed: 20260809,
      stage: 1,
      checks: 3,
      mistakes: 1,
      selectedOptionId: 't55',
      lastRun: { stage: 1, optionId: 't55', correct: true },
      solved: false,
    }
    expect(writePuzzleSession(storage as unknown as Storage, session)).toBe(true)
    expect(puzzleSessionHasProgress(session)).toBe(true)
    const case002 = AUTHORED_PUZZLE_CASES[STORY_CASE_002.id]
    const case003 = AUTHORED_PUZZLE_CASES[STORY_CASE_003.id]
    expect(readPuzzleSession(storage as unknown as Storage, case002, session.seed)).toEqual(session)
    expect(readPuzzleSession(storage as unknown as Storage, case003, session.seed)).toBeUndefined()

    storage.setItem(puzzleSessionKey(STORY_CASE_002.id, session.seed), JSON.stringify({ ...session, mistakes: 4 }))
    expect(readPuzzleSession(storage as unknown as Storage, case002, session.seed)).toBeUndefined()

    clearPuzzleSession(storage as unknown as Storage, STORY_CASE_002.id, session.seed)
    expect(storage.getItem(puzzleSessionKey(STORY_CASE_002.id, session.seed))).toBeNull()
  })

  it('rejects forged solved checkpoints that skip authored puzzle gates', () => {
    const storage = new MemoryStorage()
    const case002 = AUTHORED_PUZZLE_CASES[STORY_CASE_002.id]
    const key = puzzleSessionKey(STORY_CASE_002.id, 20260809)

    storage.setItem(key, JSON.stringify({
      version: 1,
      caseId: STORY_CASE_002.id,
      seed: 20260809,
      stage: 2,
      checks: 0,
      mistakes: 0,
      solved: true,
    }))
    expect(readPuzzleSession(storage as unknown as Storage, case002, 20260809)).toBeUndefined()

    storage.setItem(key, JSON.stringify({
      version: 1,
      caseId: STORY_CASE_002.id,
      seed: 20260809,
      stage: 2,
      checks: 3,
      mistakes: 0,
      selectedOptionId: 'accuracy-trust',
      lastRun: { stage: 2, optionId: 'accuracy-trust', correct: true },
      solved: true,
    }))
    expect(readPuzzleSession(storage as unknown as Storage, case002, 20260809)).toBeUndefined()
  })

  it('records evidence revisions in authored-case ratings without creating a grind loop', () => {
    expect(puzzleCaseScore(0)).toEqual({ grade: 'S', score: 100 })
    expect(puzzleCaseScore(1)).toEqual({ grade: 'A', score: 92 })
    expect(puzzleCaseScore(2)).toEqual({ grade: 'B', score: 84 })
    expect(puzzleCaseScore(4)).toEqual({ grade: 'C', score: 68 })
    expect(puzzleCaseScore(99)).toEqual({ grade: 'C', score: 55 })
  })

  it('materializes stage-specific QA checkpoints that still pass the normal session validator', () => {
    const storage = new MemoryStorage()
    const config = AUTHORED_PUZZLE_CASES[STORY_CASE_004.id]
    const checkpoint = createPuzzleCheatSession(config, 20260809, 'clean-model')
    expect(checkpoint).toMatchObject({ stage: 2, checks: 2, mistakes: 0, solved: false })
    expect(writePuzzleSession(storage as unknown as Storage, checkpoint!)).toBe(true)
    expect(readPuzzleSession(storage as unknown as Storage, config, 20260809)).toEqual(checkpoint)
    expect(createPuzzleCheatSession(config, 20260809, 'missing-stage')).toBeUndefined()
  })
})
