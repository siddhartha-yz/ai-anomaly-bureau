import { afterEach, describe, expect, it, vi } from 'vitest'
import { BehaviorLogger } from '../src/game/logging'

afterEach(() => {
  vi.useRealTimers()
})

describe('BehaviorLogger continuation', () => {
  it('continues the same anonymous session after a Story checkpoint restore', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T05:30:00.000Z'))
    const first = new BehaviorLogger(20260809)
    first.record({
      stage: 'inspect_data', action: 'OBSERVE_DONE', retryCount: 0, completed: false,
      features: ['warmth', 'roundness'], model: 'linear',
    })
    const before = first.snapshot()

    vi.setSystemTime(new Date('2026-08-10T05:32:00.000Z'))
    const resumed = new BehaviorLogger(20260809, before)
    resumed.record({
      stage: 'inspect_errors', action: 'VIEW_MISTAKE', retryCount: 0, completed: false,
      mistakeId: 'field-002', testAccuracy: .67,
    })
    const after = resumed.snapshot()

    expect(after.sessionId).toBe(before.sessionId)
    expect(after.startedAt).toBe(before.startedAt)
    expect(after.events.map((event) => event.action)).toEqual(['OBSERVE_DONE', 'VIEW_MISTAKE'])
    expect(after.events[1].elapsedMs).toBe(120_000)
    expect(after.events[0]).not.toBe(before.events[0])
  })

  it('starts a new session when no checkpoint log is supplied', () => {
    const a = new BehaviorLogger(42)
    const b = new BehaviorLogger(42)
    expect(a.sessionId).not.toBe(b.sessionId)
    expect(a.snapshot().events).toEqual([])
    expect(b.snapshot().events).toEqual([])
  })
})
