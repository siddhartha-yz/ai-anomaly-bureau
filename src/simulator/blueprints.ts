import type { SimulatorGraph, SimulatorNode, SimulatorWire } from './types'

export type SimulatorBlueprint = {
  id: string
  name: string
  nodes: SimulatorNode[]
  wires: SimulatorWire[]
}

export function createBlueprint(graph: SimulatorGraph, nodeIds: readonly string[], id: string, name: string): SimulatorBlueprint {
  const selected = new Set(nodeIds)
  const nodes = graph.nodes.filter((node) => selected.has(node.id))
  if (!nodes.length) throw new Error('至少选择一个节点才能保存蓝图。')
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  return {
    id,
    name: name.trim() || 'UNTITLED BLUEPRINT',
    nodes: nodes.map((node) => ({
      ...node,
      x: node.x - minX,
      y: node.y - minY,
      config: node.config ? { ...node.config, values: node.config.values ? [...node.config.values] : undefined } : undefined,
    })),
    wires: graph.wires
      .filter((wire) => selected.has(wire.fromNodeId) && selected.has(wire.toNodeId))
      .map((wire) => ({ ...wire })),
  }
}

function uniqueNodeId(graph: SimulatorGraph, base: string, reserved: Set<string>) {
  let index = 1
  let candidate = `${base}_copy`
  while (graph.nodes.some((node) => node.id === candidate) || reserved.has(candidate)) {
    index += 1
    candidate = `${base}_copy${index}`
  }
  reserved.add(candidate)
  return candidate
}

export function instantiateBlueprint(graph: SimulatorGraph, blueprint: SimulatorBlueprint, origin = { x: 80, y: 80 }): SimulatorGraph {
  const reserved = new Set<string>()
  const idMap = new Map<string, string>()
  const nodes = blueprint.nodes.map((node) => {
    const id = uniqueNodeId(graph, node.id, reserved)
    idMap.set(node.id, id)
    return {
      ...node,
      id,
      x: origin.x + node.x,
      y: origin.y + node.y,
      config: node.config ? { ...node.config, values: node.config.values ? [...node.config.values] : undefined } : undefined,
    }
  })
  const reservedWireIds = new Set(graph.wires.map((wire) => wire.id))
  const wires = blueprint.wires.map((wire, index) => {
    const base = `blueprint_${blueprint.id}_${index + 1}`
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
  return { nodes: [...graph.nodes, ...nodes], wires: [...graph.wires, ...wires] }
}

export function parseBlueprints(raw: string | null): SimulatorBlueprint[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SimulatorBlueprint => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Partial<SimulatorBlueprint>
      return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && Array.isArray(candidate.nodes)
        && Array.isArray(candidate.wires)
    })
  } catch {
    return []
  }
}
