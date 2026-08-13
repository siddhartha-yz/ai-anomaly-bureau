import { NODE_DEFINITIONS } from './catalog'
import { findNode, topologicalOrder } from './graph'
import { signalKey, type RuntimeFrame, type RuntimeResult, type RuntimeSession, type RuntimeStep, type SignalValue, type SimulatorGraph } from './types'

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

function validateStreamClock(graph: SimulatorGraph) {
  const streams = graph.nodes.filter((node) => node.kind === 'boolean-stream-input')
  if (streams.length <= 1) return
  const lengths = streams.map((node) => node.config?.values?.length ?? 0)
  if (lengths.some((length) => length !== lengths[0])) throw new Error('所有 BOOLEAN STREAM 必须具有相同长度，才能逐样本运行。')
}

export function createRuntimeSession(graph: SimulatorGraph): RuntimeSession {
  validateStreamClock(graph)
  return { tick: 0, totalTicks: streamClockLength(graph), nodeIndex: 0, values: {} }
}

function evaluateStreamMicroStep(graph: SimulatorGraph, session: RuntimeSession): RuntimeFrame {
  if (!session.totalTicks) throw new Error('当前图没有 sample clock。')
  if (session.tick >= session.totalTicks) throw new Error('所有样本时钟已经执行完毕。')

  const tick = session.tick + 1
  const values: Record<string, SignalValue> = { ...session.values }
  const order = topologicalOrder(graph)
  const nodeId = order[session.nodeIndex]
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

  let outputs: Record<string, SignalValue>
  if (node.kind === 'boolean-stream-input') {
    const key = signalKey(node.id, 'value')
    const previous = Array.isArray(session.values[key]) ? session.values[key] as readonly boolean[] : []
    const nextValue = node.config?.values?.[tick - 1]
    if (typeof nextValue !== 'boolean') throw new Error(`${definition.title} 在 SAMPLE ${tick} 没有可用值。`)
    outputs = { value: [...previous, nextValue] }
  } else if (node.kind === 'stream-equal') {
    const a = inputs.a as readonly boolean[]
    const b = inputs.b as readonly boolean[]
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== tick || b.length !== tick) throw new Error('STREAM EQUAL 需要当前时钟的两路 boolean stream。')
    const key = signalKey(node.id, 'result')
    const previous = Array.isArray(session.values[key]) ? session.values[key] as readonly boolean[] : []
    outputs = { result: [...previous, a[tick - 1] === b[tick - 1]] }
  } else if (node.kind === 'count-true') {
    const stream = inputs.stream as readonly boolean[]
    if (!Array.isArray(stream) || stream.length !== tick) throw new Error('COUNT TRUE 需要当前时钟的 boolean stream。')
    const previous = Number(session.values[signalKey(node.id, 'count')] ?? 0)
    outputs = { count: previous + (stream[tick - 1] ? 1 : 0) }
  } else if (node.kind === 'stream-length') {
    const stream = inputs.stream as readonly boolean[]
    if (!Array.isArray(stream) || stream.length !== tick) throw new Error('STREAM LENGTH 需要当前时钟的 boolean stream。')
    const previous = Number(session.values[signalKey(node.id, 'count')] ?? 0)
    outputs = { count: previous + 1 }
  } else {
    outputs = definition.evaluate(inputs, node)
  }

  for (const [portId, value] of Object.entries(outputs)) values[signalKey(node.id, portId)] = value
  const sampleComplete = session.nodeIndex === order.length - 1
  return {
    tick,
    totalTicks: session.totalTicks,
    nodeIndex: session.nodeIndex,
    nodeCount: order.length,
    sampleComplete,
    result: { steps: [{ nodeId: node.id, outputs }], values },
  }
}

export function stepRuntimeSession(graph: SimulatorGraph, session: RuntimeSession) {
  const frame = evaluateStreamMicroStep(graph, session)
  const nextNodeIndex = frame.sampleComplete ? 0 : session.nodeIndex + 1
  const nextTick = frame.sampleComplete ? session.tick + 1 : session.tick
  return {
    frame,
    session: { tick: nextTick, totalTicks: frame.totalTicks, nodeIndex: nextNodeIndex, values: frame.result.values } satisfies RuntimeSession,
  }
}

export function evaluateRuntimeTimeline(graph: SimulatorGraph): RuntimeFrame[] {
  const clockLength = streamClockLength(graph)
  if (!clockLength) {
    const result = evaluateGraph(graph)
    return [{ tick: 1, totalTicks: 1, nodeIndex: result.steps.length - 1, nodeCount: result.steps.length, sampleComplete: true, result }]
  }
  let session = createRuntimeSession(graph)
  const frames: RuntimeFrame[] = []
  let sampleSteps: RuntimeStep[] = []
  while (session.tick < clockLength) {
    const stepped = stepRuntimeSession(graph, session)
    session = stepped.session
    sampleSteps.push(...stepped.frame.result.steps)
    if (stepped.frame.sampleComplete) {
      frames.push({
        ...stepped.frame,
        result: { steps: sampleSteps, values: stepped.frame.result.values },
      })
      sampleSteps = []
    }
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
