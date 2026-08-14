import { signalKey, type SignalValue, type SimulatorGraph } from './types'

export type SignalProbeReading = {
  wireId: string
  from: string
  to: string
  value?: SignalValue
  latest?: number | boolean
  sampleCount: number
}

export function latestSignalValue(value: SignalValue | undefined): number | boolean | undefined {
  if (Array.isArray(value)) return value.at(-1)
  if (typeof value === 'number' || typeof value === 'boolean') return value
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
