import type { RuntimeFrame, SignalValue } from './types'

export type RuntimeTraceEntry = {
  sequence: number
  tick: number
  totalTicks: number
  nodeIndex: number
  nodeCount: number
  nodeId: string
  outputs: Record<string, SignalValue>
  values: Record<string, SignalValue>
}

export function appendRuntimeTrace(
  history: readonly RuntimeTraceEntry[],
  frame: RuntimeFrame,
  maxEntries = 500,
): RuntimeTraceEntry[] {
  const step = frame.result.steps.at(-1)
  if (!step) return [...history]
  const entry: RuntimeTraceEntry = {
    sequence: (history.at(-1)?.sequence ?? 0) + 1,
    tick: frame.tick,
    totalTicks: frame.totalTicks,
    nodeIndex: frame.nodeIndex,
    nodeCount: frame.nodeCount,
    nodeId: step.nodeId,
    outputs: step.outputs,
    values: frame.result.values,
  }
  return [...history, entry].slice(-Math.max(1, maxEntries))
}
