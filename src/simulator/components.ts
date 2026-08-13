import { NODE_DEFINITIONS } from './catalog'
import type { PortAddress, PortDirection, SignalType, SimulatorComponentDefinition, SimulatorComponentInstance, SimulatorGraph, SimulatorNode, SimulatorWire } from './types'

function cloneNode(node: SimulatorNode): SimulatorNode {
  return {
    ...node,
    config: node.config ? {
      ...node.config,
      values: node.config.values ? [...node.config.values] : undefined,
      numberValues: node.config.numberValues ? [...node.config.numberValues] : undefined,
    } : undefined,
  }
}

function cloneWire(wire: SimulatorWire): SimulatorWire {
  return { ...wire }
}

export function createComponentDefinition(
  graph: SimulatorGraph,
  nodeIds: readonly string[],
  id: string,
  name: string,
): SimulatorComponentDefinition {
  const selected = new Set(nodeIds)
  const nodes = graph.nodes.filter((node) => selected.has(node.id))
  if (!nodes.length) throw new Error('至少选择一个节点才能封装组件。')

  // Component instances are stored as flattened primitive nodes in the graph.
  // Re-encapsulation is therefore safe as long as the player selected the whole
  // visible black box. Selecting only part of an instance would pierce its
  // abstraction boundary, so reject that malformed program explicitly.
  const selectedComponentIds = new Set(nodes.map((node) => node.componentInstanceId).filter((value): value is string => Boolean(value)))
  for (const instanceId of selectedComponentIds) {
    const instance = (graph.components ?? []).find((item) => item.id === instanceId)
    if (!instance || instance.nodeIds.some((nodeId) => !selected.has(nodeId))) {
      throw new Error('封装已有组件时必须选择完整黑盒，不能只截取内部节点。')
    }
  }

  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const internalWires = graph.wires.filter((wire) => selected.has(wire.fromNodeId) && selected.has(wire.toNodeId))
  const ports: SimulatorComponentDefinition['ports'] = []
  let inputIndex = 0
  let outputIndex = 0

  for (const node of nodes) {
    const definition = NODE_DEFINITIONS[node.kind]
    for (const port of definition.inputs) {
      const internallyDriven = internalWires.some((wire) => wire.toNodeId === node.id && wire.toPortId === port.id)
      if (internallyDriven) continue
      inputIndex += 1
      ports.push({
        id: `in_${inputIndex}`,
        label: port.label,
        type: port.type,
        direction: 'input',
        nodeId: node.id,
        portId: port.id,
      })
    }
    for (const port of definition.outputs) {
      const internalConsumers = internalWires.some((wire) => wire.fromNodeId === node.id && wire.fromPortId === port.id)
      const externalConsumer = graph.wires.some((wire) => wire.fromNodeId === node.id && wire.fromPortId === port.id && !selected.has(wire.toNodeId))
      if (internalConsumers && !externalConsumer) continue
      outputIndex += 1
      ports.push({
        id: `out_${outputIndex}`,
        label: port.label,
        type: port.type,
        direction: 'output',
        nodeId: node.id,
        portId: port.id,
      })
    }
  }

  if (!ports.some((port) => port.direction === 'input') || !ports.some((port) => port.direction === 'output')) {
    throw new Error('黑盒组件必须至少暴露一个输入和一个输出端口。')
  }

  return {
    id,
    name: name.trim() || 'UNTITLED COMPONENT',
    // A newly saved component owns a fresh abstraction boundary. Strip the old
    // instance ownership so this definition can be instantiated independently
    // and then be used again inside another player-built component.
    nodes: nodes.map((node) => {
      const cloned = cloneNode(node)
      delete cloned.componentInstanceId
      return { ...cloned, x: node.x - minX, y: node.y - minY }
    }),
    wires: internalWires.map(cloneWire),
    ports,
  }
}

function uniqueNodeId(graph: SimulatorGraph, base: string, reserved: Set<string>) {
  let index = 1
  let candidate = `${base}_unit`
  while (graph.nodes.some((node) => node.id === candidate) || reserved.has(candidate)) {
    index += 1
    candidate = `${base}_unit${index}`
  }
  reserved.add(candidate)
  return candidate
}

function uniqueInstanceId(graph: SimulatorGraph, definitionId: string) {
  const instances = graph.components ?? []
  let index = 1
  let id = `${definitionId}_instance_${index}`
  while (instances.some((instance) => instance.id === id)) {
    index += 1
    id = `${definitionId}_instance_${index}`
  }
  return id
}

export function instantiateComponent(
  graph: SimulatorGraph,
  definition: SimulatorComponentDefinition,
  origin = { x: 120, y: 120 },
): SimulatorGraph {
  const instanceId = uniqueInstanceId(graph, definition.id)
  const reserved = new Set<string>()
  const idMap = new Map<string, string>()
  const nodes = definition.nodes.map((node) => {
    const id = uniqueNodeId(graph, node.id, reserved)
    idMap.set(node.id, id)
    return {
      ...cloneNode(node),
      id,
      x: origin.x + node.x,
      y: origin.y + node.y,
      componentInstanceId: instanceId,
    }
  })
  const reservedWireIds = new Set(graph.wires.map((wire) => wire.id))
  const wires = definition.wires.map((wire, index) => {
    const base = `${instanceId}_wire_${index + 1}`
    let id = base
    let suffix = 1
    while (reservedWireIds.has(id)) { suffix += 1; id = `${base}_${suffix}` }
    reservedWireIds.add(id)
    return {
      ...wire,
      id,
      fromNodeId: idMap.get(wire.fromNodeId)!,
      toNodeId: idMap.get(wire.toNodeId)!,
    }
  })
  const boundaryMap: Record<string, PortAddress> = {}
  for (const port of definition.ports) {
    boundaryMap[port.id] = { nodeId: idMap.get(port.nodeId)!, portId: port.portId }
  }
  const instance: SimulatorComponentInstance = {
    id: instanceId,
    definitionId: definition.id,
    x: origin.x,
    y: origin.y,
    nodeIds: nodes.map((node) => node.id),
    boundaryMap,
  }
  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    wires: [...graph.wires, ...wires],
    components: [...(graph.components ?? []), instance],
  }
}

export function removeComponentInstance(graph: SimulatorGraph, instanceId: string): SimulatorGraph {
  const instance = (graph.components ?? []).find((item) => item.id === instanceId)
  if (!instance) return graph
  const nodeIds = new Set(instance.nodeIds)
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !nodeIds.has(node.id)),
    wires: graph.wires.filter((wire) => !nodeIds.has(wire.fromNodeId) && !nodeIds.has(wire.toNodeId)),
    components: (graph.components ?? []).filter((item) => item.id !== instanceId),
  }
}

export function moveComponentInstance(graph: SimulatorGraph, instanceId: string, x: number, y: number): SimulatorGraph {
  const instance = (graph.components ?? []).find((item) => item.id === instanceId)
  if (!instance) return graph
  const dx = x - instance.x
  const dy = y - instance.y
  const nodeIds = new Set(instance.nodeIds)
  return {
    ...graph,
    nodes: graph.nodes.map((node) => nodeIds.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node),
    components: (graph.components ?? []).map((item) => item.id === instanceId ? { ...item, x, y } : item),
  }
}

export function componentBoundaryAddress(instance: SimulatorComponentInstance, portId: string) {
  return instance.boundaryMap[portId]
}

function validPortDirection(value: unknown): value is PortDirection {
  return value === 'input' || value === 'output'
}

function validSignalType(value: unknown): value is SignalType {
  return value === 'number' || value === 'boolean' || value === 'number-stream' || value === 'boolean-stream'
}

export function parseComponentDefinitions(raw: string | null): SimulatorComponentDefinition[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SimulatorComponentDefinition => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<SimulatorComponentDefinition>
      return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && Array.isArray(candidate.nodes)
        && Array.isArray(candidate.wires)
        && Array.isArray(candidate.ports)
        && candidate.ports.every((port) => port && typeof port === 'object'
          && typeof port.id === 'string'
          && typeof port.label === 'string'
          && typeof port.nodeId === 'string'
          && typeof port.portId === 'string'
          && validPortDirection(port.direction)
          && validSignalType(port.type))
    })
  } catch {
    return []
  }
}
