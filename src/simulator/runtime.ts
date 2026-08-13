import { NODE_DEFINITIONS } from './catalog'
import { findNode, topologicalOrder } from './graph'
import { signalKey, type RuntimeResult, type RuntimeStep, type SignalValue, type SimulatorGraph } from './types'

export function evaluateGraph(graph: SimulatorGraph): RuntimeResult {
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
    const outputs = definition.evaluate(inputs, node)
    for (const [portId, value] of Object.entries(outputs)) values[signalKey(node.id, portId)] = value
    steps.push({ nodeId: node.id, outputs })
  }
  return { steps, values }
}

export function visibleValuesAfterStep(result: RuntimeResult, stepIndex: number) {
  const visible: Record<string, SignalValue> = {}
  for (const step of result.steps.slice(0, stepIndex + 1)) {
    for (const [portId, value] of Object.entries(step.outputs)) visible[signalKey(step.nodeId, portId)] = value
  }
  return visible
}
