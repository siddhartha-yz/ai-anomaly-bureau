import type { SimulatorGraph } from './types'

export type BoardRect = { x1: number; y1: number; x2: number; y2: number }

export function normalizeBoardRect(rect: BoardRect) {
  return {
    left: Math.min(rect.x1, rect.x2),
    top: Math.min(rect.y1, rect.y2),
    right: Math.max(rect.x1, rect.x2),
    bottom: Math.max(rect.y1, rect.y2),
  }
}

function intersects(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

export function selectVisibleUnitsInRect(
  graph: SimulatorGraph,
  rect: BoardRect,
  nodeSize: { width: number; height: number },
  componentSize: { width: number; height: number },
) {
  const selection = normalizeBoardRect(rect)
  const nodeIds = graph.nodes
    .filter((node) => !node.componentInstanceId)
    .filter((node) => intersects(selection, { left: node.x, top: node.y, right: node.x + nodeSize.width, bottom: node.y + nodeSize.height }))
    .map((node) => node.id)
  const componentInstanceIds = (graph.components ?? [])
    .filter((component) => intersects(selection, { left: component.x, top: component.y, right: component.x + componentSize.width, bottom: component.y + componentSize.height }))
    .map((component) => component.id)
  return { nodeIds, componentInstanceIds }
}

export function moveSelectedUnits(
  graph: SimulatorGraph,
  nodeIds: readonly string[],
  componentInstanceIds: readonly string[],
  dx: number,
  dy: number,
): SimulatorGraph {
  if (!dx && !dy) return graph
  const nodes = new Set(nodeIds)
  const components = new Set(componentInstanceIds)
  const componentNodeIds = new Set(
    (graph.components ?? [])
      .filter((component) => components.has(component.id))
      .flatMap((component) => component.nodeIds),
  )
  return {
    ...graph,
    nodes: graph.nodes.map((node) => nodes.has(node.id) || componentNodeIds.has(node.id)
      ? { ...node, x: node.x + dx, y: node.y + dy }
      : node),
    components: (graph.components ?? []).map((component) => components.has(component.id)
      ? { ...component, x: component.x + dx, y: component.y + dy }
      : component),
  }
}
