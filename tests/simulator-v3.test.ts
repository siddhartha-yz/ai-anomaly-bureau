import { describe, expect, it } from 'vitest'
import { connect, createEmptyGraph, createNode, topologicalOrder } from '../src/simulator/graph'
import { evaluateGraph, visibleValuesAfterStep } from '../src/simulator/runtime'
import { signalKey, type SimulatorGraph } from '../src/simulator/types'

function thresholdGraph(): SimulatorGraph {
  let graph = createEmptyGraph()
  graph = {
    ...graph,
    nodes: [
      { ...createNode('number-input', 'score', 0, 0), config: { value: .72 } },
      { ...createNode('constant', 'threshold', 0, 0), config: { value: .6 } },
      createNode('greater-than', 'gt', 0, 0),
      createNode('boolean-output', 'out', 0, 0),
    ],
  }
  graph = connect(graph, { id: 'w1', fromNodeId: 'score', fromPortId: 'value', toNodeId: 'gt', toPortId: 'a' })
  graph = connect(graph, { id: 'w2', fromNodeId: 'threshold', fromPortId: 'value', toNodeId: 'gt', toPortId: 'b' })
  graph = connect(graph, { id: 'w3', fromNodeId: 'gt', fromPortId: 'result', toNodeId: 'out', toPortId: 'value' })
  return graph
}

describe('Simulator V3 pure graph/runtime', () => {
  it('builds a threshold machine from primitives and evaluates actual signals', () => {
    const result = evaluateGraph(thresholdGraph())
    expect(result.values[signalKey('score', 'value')]).toBe(.72)
    expect(result.values[signalKey('threshold', 'value')]).toBe(.6)
    expect(result.values[signalKey('gt', 'result')]).toBe(true)
    expect(result.values[signalKey('out', 'value')]).toBe(true)
  })

  it('changes behavior when the player changes a primitive value', () => {
    const graph = thresholdGraph()
    graph.nodes = graph.nodes.map((node) => node.id === 'score' ? { ...node, config: { value: .42 } } : node)
    expect(evaluateGraph(graph).values[signalKey('out', 'value')]).toBe(false)
  })

  it('rejects incompatible typed connections before runtime', () => {
    const base: SimulatorGraph = {
      nodes: [createNode('greater-than', 'gt', 0, 0), createNode('boolean-output', 'out', 0, 0)],
      wires: [],
    }
    expect(() => connect(base, { id: 'bad', fromNodeId: 'gt', fromPortId: 'result', toNodeId: 'gt', toPortId: 'a' })).toThrow(/不能把节点接回自己|类型不匹配/)
  })

  it('refuses to run an incomplete machine instead of inventing defaults', () => {
    const graph: SimulatorGraph = { nodes: [createNode('greater-than', 'gt', 0, 0)], wires: [] }
    expect(() => evaluateGraph(graph)).toThrow(/尚未接线/)
  })

  it('exposes node-by-node values for STEP debugging', () => {
    const result = evaluateGraph(thresholdGraph())
    const first = visibleValuesAfterStep(result, 0)
    expect(Object.keys(first)).toHaveLength(1)
    expect(Object.keys(visibleValuesAfterStep(result, result.steps.length - 1))).toHaveLength(4)
  })

  it('rejects cyclic dataflow', () => {
    const graph: SimulatorGraph = {
      nodes: [createNode('greater-than', 'a', 0, 0), createNode('greater-than', 'b', 0, 0)],
      wires: [
        { id: 'x', fromNodeId: 'a', fromPortId: 'result', toNodeId: 'b', toPortId: 'a' },
        { id: 'y', fromNodeId: 'b', fromPortId: 'result', toNodeId: 'a', toPortId: 'a' },
      ],
    }
    expect(() => topologicalOrder(graph)).toThrow(/环路/)
  })
})
