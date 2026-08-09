import { describe, expect, it } from 'vitest'
import { createAuditService } from '../src/game/audit'
import { hintFor } from '../src/game/hints'
import { createInitialGameState, gameReducer } from '../src/game/reducer'
import { PERSONAS, runPersonaRoute } from '../src/game/routes'

describe('game state and hidden audit boundary', () => {
  it('does not expose hidden test labels in the normal public test view', () => {
    const service = createAuditService(20260809)
    expect(service.publicTest).toHaveLength(24)
    expect(service.publicTest.every((sample) => sample.label === undefined)).toBe(true)
    expect(service.publicTest.every((sample) => /^field-\d{3}$/.test(sample.id))).toBe(true)
    expect(service.publicTest.every((sample) => !('flags' in sample))).toBe(true)
    expect(service.publicTest.every((sample) => !sample.id.includes('cat') && !sample.id.includes('bread'))).toBe(true)
    expect(service.train.every((sample) => sample.label === 'cat' || sample.label === 'bread')).toBe(true)
  })

  it('blocks normal-mode debug jumps', () => {
    const state = createInitialGameState(1, false, 0)
    const next = gameReducer(state, { type: 'DEBUG_JUMP', stage: 'complete' })
    expect(next.stage).toBe('briefing')
    expect(next.diagnostics.at(-1)).toContain('debug jump rejected')
  })

  it('requires viewing two different mistakes before leaving error inspection', () => {
    let state = createInitialGameState(1, false, 0)
    state = { ...state, stage: 'inspect_errors', audit: { accuracy: 0.5, errorCount: 2, orangeCatErrors: 1, mistakes: [
      { id: 'x', actual: 'cat', predicted: 'bread', correct: false, features: { warmth: 1, roundness: 1, texture: 1, aspect: 1 } },
      { id: 'y', actual: 'bread', predicted: 'cat', correct: false, features: { warmth: 0, roundness: 0, texture: 0, aspect: 0 } },
    ], confusion: { 'cat->cat': 0, 'cat->bread': 1, 'bread->cat': 1, 'bread->bread': 0 } } }
    const blocked = gameReducer(state, { type: 'ADVANCE' })
    expect(blocked.stage).toBe('inspect_errors')
    const oneViewed = gameReducer(blocked, { type: 'VIEW_MISTAKE', id: 'x' })
    expect(gameReducer(oneViewed, { type: 'ADVANCE' }).stage).toBe('inspect_errors')
    const twoViewed = gameReducer(oneViewed, { type: 'VIEW_MISTAKE', id: 'y' })
    expect(gameReducer(twoViewed, { type: 'ADVANCE' }).stage).toBe('iterate')
  })

  it('escalates hints without exceeding level three', () => {
    let state = createInitialGameState(1, false, 0)
    state = { ...state, stage: 'iterate' }
    for (let i = 0; i < 5; i += 1) state = gameReducer(state, { type: 'REQUEST_HINT' })
    expect(state.hintLevel).toBe(3)
    expect(hintFor(state)).toContain('k=1')
  })
})

describe('debug persona routes', () => {
  for (const persona of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) {
    it(`${persona} terminates in a completed session`, () => {
      const result = runPersonaRoute(persona)
      expect(result.actions.length).toBeLessThan(80)
      expect(result.finalState.stage).toBe('complete')
      expect(result.finalState.hasSeenOverfit).toBe(true)
      expect(result.finalState.auditHistory.length).toBeGreaterThanOrEqual(2)
    })
  }

  it('is deterministic for fixed seed apart from completion timestamp', () => {
    const a = runPersonaRoute('correct-understanding', 777)
    const b = runPersonaRoute('correct-understanding', 777)
    expect(a.actions).toEqual(b.actions)
    expect(a.finalState.auditHistory).toEqual(b.finalState.auditHistory)
    expect(a.finalState.selectedFeatures).toEqual(b.finalState.selectedFeatures)
  })
})
