import type { FeatureKey } from '../ml/types'
import type { ModelId } from '../ml/registry'
import type { Stage } from './types'

export type BehaviorEvent = {
  sessionId: string
  seed: number
  timestamp: string
  elapsedMs: number
  stage: Stage
  action: string
  features?: FeatureKey[]
  model?: ModelId
  trainAccuracy?: number
  testAccuracy?: number
  mistakeId?: string
  hintLevel?: 1 | 2 | 3
  retryCount: number
  completed: boolean
}

export type BehaviorLog = {
  version: 1
  sessionId: string
  seed: number
  startedAt: string
  exportedAt: string
  events: BehaviorEvent[]
}

export class BehaviorLogger {
  readonly sessionId: string
  private readonly started = Date.now()
  private readonly events: BehaviorEvent[] = []

  constructor(readonly seed: number) {
    this.sessionId = `s-${seed.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  record(event: Omit<BehaviorEvent, 'sessionId' | 'seed' | 'timestamp' | 'elapsedMs'>): void {
    const now = Date.now()
    this.events.push({
      ...event,
      sessionId: this.sessionId,
      seed: this.seed,
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - this.started,
    })
  }

  snapshot(): BehaviorLog {
    return {
      version: 1,
      sessionId: this.sessionId,
      seed: this.seed,
      startedAt: new Date(this.started).toISOString(),
      exportedAt: new Date().toISOString(),
      events: this.events.map((event) => ({ ...event, features: event.features ? [...event.features] : undefined })),
    }
  }
}
