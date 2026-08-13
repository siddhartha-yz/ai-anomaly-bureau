import { NODE_DEFINITIONS } from './catalog'
import { findNode, topologicalOrder } from './graph'
import { signalKey, type RuntimeFrame, type RuntimeResult, type RuntimeStep, type SignalValue, type SimulatorGraph } from './types'

function evaluateGraphInternal(graph: SimulatorGraph, streamLimit?: number): RuntimeResult {
  const values: Record<string, SignalValue> = {}
  const steps: RuntimeStep[] = []
  for (const nodeId of topologicalOrder(graph)) {
    const node = findNode(graph, nodeId)
    if (!node) throw new Error(`找不到节点 ${nodeId}`)
    const definition = NODE_DEFINITIONS[node.kind]
    const inputs: Record<string, SignalValue> = {}
    for (const port of definition.inputs) {
      const wire = graph.wires.find((item) => item.toNodeId === node.id && item.toPortId === port.id)
      if (!wire) throw new Error(`${definition.title}.${port.label} 尚未接线。`)
      const key = signalKey(wire.fromNodeId, wire.fromPortId)
      if (!(key in values)) throw new Error(`${definition.title}.${port.label} 上游尚无可用信号。`)
      inputs[port.id] = values[key]
    }
    const runtimeNode = node.kind === 'boolean-stream-input' && streamLimit !== undefined
      ? { ...node, config: { ...node.config, values: (node.config?.values ?? []).slice(0, streamLimit) } }
      : node
    const outputs = definition.evaluate(inputs, runtimeNode)
    for (const [portId, value] of Object.entries(outputs)) values[signalKey(node.id, portId)] = value
    steps.push({ nodeId: node.id, outputs })
  }
  return { steps, values }
}

export function evaluateGraph(graph: SimulatorGraph): RuntimeResult {
  return evaluateGraphInternal(graph)
}

export function streamClockLength(graph: SimulatorGraph) {
  const streams = graph.nodes.filter((node) => node.kind === 'boolean-stream-input')
  if (!streams.length) return 0
  return Math.max(...streams.map((node) => node.config?.values?.length ?? 0))
}

export function evaluateRuntimeTimeline(graph: SimulatorGraph): RuntimeFrame[] {
  const streams = graph.nodes.filter((node) => node.kind === 'boolean-stream-input')
  if (streams.length > 1) {
    const lengths = streams.map((node) => node.config?.values?.length ?? 0)
    if (lengths.some((length) => length !== lengths[0])) throw new Error('所有 BOOLEAN STREAM 必须具有相同长度，才能逐样本运行。')
  }
  const clockLength = streamClockLength(graph)
  if (!clockLength) return [{ tick: 1, totalTicks: 1, result: evaluateGraph(graph) }]
  const frames: RuntimeFrame[] = []
  for (let tick = 1; tick <= clockLength; tick += 1) {
    frames.push({ tick, totalTicks: clockLength, result: evaluateGraphInternal(graph, tick) })
  }
  return frames
}

export function visibleValuesAfterStep(result: RuntimeResult, stepIndex: number) {
  const visible: Record<string, SignalValue> = {}
  for (const step of result.steps.slice(0, stepIndex + 1)) {
    for (const [portId, value] of Object.entries(step.outputs)) visible[signalKey(step.nodeId, portId)] = value
  }
  return visible
}
