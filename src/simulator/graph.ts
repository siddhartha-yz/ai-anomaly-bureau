import { NODE_DEFINITIONS } from './catalog'
import type { PortAddress, SignalType, SimulatorGraph, SimulatorNode, SimulatorNodeKind, SimulatorWire } from './types'

export type ConnectionCheck = { ok: true } | { ok: false; reason: string }

export function createEmptyGraph(): SimulatorGraph {
  return { nodes: [], wires: [], components: [] }
}

export function createNode(kind: SimulatorNodeKind, id: string, x: number, y: number): SimulatorNode {
  const definition = NODE_DEFINITIONS[kind]
  return {
    id,
    kind,
    x,
    y,
    config: definition.defaultConfig ? { ...definition.defaultConfig } : undefined,
  }
}

export function findNode(graph: SimulatorGraph, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)
}

export function portType(graph: SimulatorGraph, address: PortAddress): SignalType | undefined {
  const node = findNode(graph, address.nodeId)
  if (!node) return undefined
  const definition = NODE_DEFINITIONS[node.kind]
  return [...definition.inputs, ...definition.outputs].find((port) => port.id === address.portId)?.type
}

export function isOutputPort(graph: SimulatorGraph, address: PortAddress) {
  const node = findNode(graph, address.nodeId)
  if (!node) return false
  return NODE_DEFINITIONS[node.kind].outputs.some((port) => port.id === address.portId)
}

export function isInputPort(graph: SimulatorGraph, address: PortAddress) {
  const node = findNode(graph, address.nodeId)
  if (!node) return false
  return NODE_DEFINITIONS[node.kind].inputs.some((port) => port.id === address.portId)
}

export function canConnect(graph: SimulatorGraph, from: PortAddress, to: PortAddress): ConnectionCheck {
  if (from.nodeId === to.nodeId) return { ok: false, reason: '不能把节点接回自己。' }
  if (!isOutputPort(graph, from)) return { ok: false, reason: '连线必须从输出端口开始。' }
  if (!isInputPort(graph, to)) return { ok: false, reason: '连线必须接到输入端口。' }
  const fromType = portType(graph, from)
  const toType = portType(graph, to)
  if (!fromType || !toType || fromType !== toType) return { ok: false, reason: `端口类型不匹配：${fromType ?? '?'} → ${toType ?? '?'}` }
  if (graph.wires.some((wire) => wire.toNodeId === to.nodeId && wire.toPortId === to.portId)) return { ok: false, reason: '这个输入端口已经有信号。' }
  return { ok: true }
}

export function connect(graph: SimulatorGraph, wire: SimulatorWire): SimulatorGraph {
  const check = canConnect(graph, { nodeId: wire.fromNodeId, portId: wire.fromPortId }, { nodeId: wire.toNodeId, portId: wire.toPortId })
  if (!check.ok) throw new Error(check.reason)
  return { ...graph, wires: [...graph.wires, wire] }
}

export function removeNode(graph: SimulatorGraph, nodeId: string): SimulatorGraph {
  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    wires: graph.wires.filter((wire) => wire.fromNodeId !== nodeId && wire.toNodeId !== nodeId),
  }
}

export function removeWire(graph: SimulatorGraph, wireId: string): SimulatorGraph {
  return { ...graph, wires: graph.wires.filter((wire) => wire.id !== wireId) }
}


export function executionGraph(graph: SimulatorGraph): SimulatorGraph {
  const outputNodeIds = new Set(
    graph.nodes
      .filter((node) => node.kind === 'boolean-output' || node.kind === 'number-output')
      .map((node) => node.id),
  )
  if (!outputNodeIds.size) return graph

  const included = new Set(outputNodeIds)
  let changed = true
  while (changed) {
    changed = false
    for (const wire of graph.wires) {
      if (!included.has(wire.toNodeId) || included.has(wire.fromNodeId)) continue
      included.add(wire.fromNodeId)
      changed = true
    }
  }

  return {
    nodes: graph.nodes.filter((node) => included.has(node.id)),
    wires: graph.wires.filter((wire) => included.has(wire.fromNodeId) && included.has(wire.toNodeId)),
  }
}

export function graphDependencies(graph: SimulatorGraph) {
  const dependencies = new Map<string, Set<string>>()
  for (const node of graph.nodes) dependencies.set(node.id, new Set())
  for (const wire of graph.wires) dependencies.get(wire.toNodeId)?.add(wire.fromNodeId)
  return dependencies
}

export function topologicalOrder(graph: SimulatorGraph): string[] {
  const dependencies = graphDependencies(graph)
  const order: string[] = []
  const ready = [...dependencies.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id)
  while (ready.length) {
    const nodeId = ready.shift()!
    order.push(nodeId)
    for (const [candidate, deps] of dependencies) {
      if (!deps.delete(nodeId) || deps.size !== 0 || order.includes(candidate) || ready.includes(candidate)) continue
      ready.push(candidate)
    }
  }
  if (order.length !== graph.nodes.length) throw new Error('图中存在环路；当前模拟器只允许无环数据流。')
  return order
}
