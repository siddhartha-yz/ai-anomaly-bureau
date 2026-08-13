import { describe, expect, it } from 'vitest'
import { evaluateLevelOne, evaluateScreening, evaluateShift, levelThreePass, levelTwoPass } from '../src/lab/v2Engine'
import { LAB_V2_SESSION_KEY, createLabV2Session, labV2Reducer, readLabV2Session } from '../src/lab/v2Session'

function completeLevelOne() {
  let session = createLabV2Session()
  session = labV2Reducer(session, { type: 'run' })
  session = labV2Reducer(session, { type: 'install-tool', tool: 'test-probe' })
  session = labV2Reducer(session, { type: 'set-level-one-feature', feature: 'structure' })
  return labV2Reducer(session, { type: 'run' })
}

function completeLevelTwo() {
  let session = completeLevelOne()
  session = labV2Reducer(session, { type: 'go-level', level: 2 })
  session = labV2Reducer(session, { type: 'run' })
  session = labV2Reducer(session, { type: 'install-tool', tool: 'class-probe' })
  session = labV2Reducer(session, { type: 'set-threshold', threshold: .6 })
  return labV2Reducer(session, { type: 'run' })
}

describe('V2 experiment engine', () => {
  it('makes unknown performance disagree with the attractive training shortcut', () => {
    expect(evaluateLevelOne('appearance')).toEqual({ train: 1, field: .61 })
    expect(evaluateLevelOne('structure')).toEqual({ train: .92, field: .88 })
  })

  it('accepts a range of threshold solutions instead of one designer answer', () => {
    expect(evaluateScreening(.8).urgentRecall).toBe(.25)
    expect(levelTwoPass(.8)).toBe(false)
    expect(levelTwoPass(.6)).toBe(true)
    expect(levelTwoPass(.55)).toBe(true)
    expect(levelTwoPass(.35)).toBe(false)
  })

  it('has more than one stable feature across day and night', () => {
    expect(evaluateShift('brightness', 'day').accuracy).toBe(1)
    expect(evaluateShift('brightness', 'night').accuracy).toBeLessThan(.8)
    expect(levelThreePass('brightness')).toBe(false)
    expect(levelThreePass('texture')).toBe(true)
    expect(levelThreePass('shape')).toBe(true)
  })
})

describe('V2 primitive progression', () => {
  it('requires the player to expose the failure before TEST PROBE can be installed', () => {
    let session = createLabV2Session()
    session = labV2Reducer(session, { type: 'set-level-one-feature', feature: 'structure' })
    expect(session.levelOneFeature).toBe('appearance')
    session = labV2Reducer(session, { type: 'install-tool', tool: 'test-probe' })
    expect(session.installedTools).not.toContain('test-probe')

    session = labV2Reducer(session, { type: 'run' })
    expect(session.unlockedTools).toContain('test-probe')
    expect(session.completedLevels).not.toContain(1)

    session = labV2Reducer(session, { type: 'install-tool', tool: 'test-probe' })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.completedLevels).not.toContain(1)

    session = labV2Reducer(session, { type: 'set-level-one-feature', feature: 'structure' })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.completedLevels).toContain(1)
    expect(session.unlockedLevel).toBe(2)
  })

  it('reuses TEST PROBE and only passes level 2 after CLASS PROBE exposes minority recall', () => {
    let session = completeLevelOne()
    expect(session.installedTools).toContain('test-probe')
    session = labV2Reducer(session, { type: 'go-level', level: 2 })
    session = labV2Reducer(session, { type: 'set-threshold', threshold: .6 })
    expect(session.threshold).toBe(.8)
    session = labV2Reducer(session, { type: 'run' })
    expect(session.unlockedTools).toContain('class-probe')
    expect(session.completedLevels).not.toContain(2)

    session = labV2Reducer(session, { type: 'install-tool', tool: 'class-probe' })
    session = labV2Reducer(session, { type: 'set-threshold', threshold: .6 })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.completedLevels).toContain(2)
    expect(session.unlockedLevel).toBe(3)
  })

  it('requires the same feature to pass both environments instead of mixing two unrelated runs', () => {
    let session = completeLevelTwo()
    session = labV2Reducer(session, { type: 'go-level', level: 3 })
    session = labV2Reducer(session, { type: 'set-shift-feature', feature: 'texture' })
    session = labV2Reducer(session, { type: 'set-environment', environment: 'night' })
    expect(session.shiftFeature).toBe('brightness')
    expect(session.environment).toBe('day')
    session = labV2Reducer(session, { type: 'run' })
    expect(session.unlockedTools).toContain('environment-switch')
    session = labV2Reducer(session, { type: 'install-tool', tool: 'environment-switch' })

    session = labV2Reducer(session, { type: 'set-shift-feature', feature: 'brightness' })
    session = labV2Reducer(session, { type: 'set-environment', environment: 'day' })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.shiftPasses.day).toBe('brightness')

    session = labV2Reducer(session, { type: 'set-shift-feature', feature: 'texture' })
    session = labV2Reducer(session, { type: 'set-environment', environment: 'night' })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.completedLevels).not.toContain(3)

    session = labV2Reducer(session, { type: 'set-environment', environment: 'day' })
    session = labV2Reducer(session, { type: 'run' })
    expect(session.completedLevels).toContain(3)
  })

  it('rejects malformed persisted state back to a clean lab', () => {
    const storage = { getItem: (key: string) => key === LAB_V2_SESSION_KEY ? JSON.stringify({ version: 1, level: 99, unlockedLevel: 3 }) : null }
    expect(readLabV2Session(storage).level).toBe(1)
    expect(readLabV2Session(storage).installedTools).toEqual([])
  })
})
