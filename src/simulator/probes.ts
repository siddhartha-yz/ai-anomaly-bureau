import { signalKey, type SignalValue, type SimulatorGraph } from './types'

export type SignalProbeReading = {
  wireId: string
  from: string
  to: string
  value?: SignalValue
  latest?: number | boolean
  sampleCount: number
}

export type SignalProbeBreakCondition =
  | { mode: 'boolean'; value: boolean }
  | { mode: 'number-at-least'; threshold: number }
  | { mode: 'number-at-most'; threshold: number }

export function latestSignalValue(value: SignalValue | undefined): number | boolean | undefined {
  if (Array.isArray(value)) return value.at(-1)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return undefined
}

export function signalProbeConditionMatches(
  condition: SignalProbeBreakCondition,
  value: SignalValue | undefined,
) {
  const latest = latestSignalValue(value)
  if (condition.mode === 'boolean') return typeof latest === 'boolean' && latest === condition.value
  if (typeof latest !== 'number' || !Number.isFinite(latest)) return false
  return condition.mode === 'number-at-least'
    ? latest >= condition.threshold
    : latest <= condition.threshold
}

export function matchingSignalProbeBreak(
  graph: SimulatorGraph,
  conditions: Readonly<Record<string, SignalProbeBreakCondition>>,
  values: Readonly<Record<string, SignalValue>>,
  sourceNodeId: string,
) {
  for (const [wireId, condition] of Object.entries(conditions)) {
    const wire = graph.wires.find((item) => item.id === wireId)
    if (!wire || wire.fromNodeId !== sourceNodeId) continue
    const value = values[signalKey(wire.fromNodeId, wire.fromPortId)]
    if (signalProbeConditionMatches(condition, value)) {
      return {
        wireId,
        condition,
        latest: latestSignalValue(value),
        from: `${wire.fromNodeId}.${wire.fromPortId}`,
      }
    }
  }
  return undefined
}

export function collectSignalProbeReadings(
  graph: SimulatorGraph,
  wireIds: readonly string[],
  values: Readonly<Record<string, SignalValue>>,
): SignalProbeReading[] {
  return wireIds.flatMap((wireId) => {
    const wire = graph.wires.find((item) => item.id === wireId)
    if (!wire) return []
    const value = values[signalKey(wire.fromNodeId, wire.fromPortId)]
    return [{
      wireId,
      from: `${wire.fromNodeId}.${wire.fromPortId}`,
      to: `${wire.toNodeId}.${wire.toPortId}`,
      value,
      latest: latestSignalValue(value),
      sampleCount: Array.isArray(value) ? value.length : value === undefined ? 0 : 1,
    }]
  })
}
