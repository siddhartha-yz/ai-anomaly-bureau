import { describe, expect, it } from 'vitest'
import { connect, createEmptyGraph, createNode, topologicalOrder } from '../src/simulator/graph'
import { createRuntimeSession, evaluateGraph, evaluateRuntimeTimeline, stepRuntimeSession, visibleValuesAfterStep } from '../src/simulator/runtime'
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

function matchRatioGraph(): SimulatorGraph {
  let graph: SimulatorGraph = {
    nodes: [
      { ...createNode('boolean-stream-input', 'predictions', 0, 0), config: { values: [true, false, true, true] } },
      { ...createNode('boolean-stream-input', 'truth', 0, 0), config: { values: [true, true, false, true] } },
      createNode('stream-equal', 'equal', 0, 0),
      createNode('count-true', 'correct', 0, 0),
      createNode('stream-length', 'total', 0, 0),
      createNode('divide', 'ratio', 0, 0),
      createNode('number-output', 'out', 0, 0),
    ],
    wires: [],
  }
  const wires = [
    ['predictions', 'value', 'equal', 'a'],
    ['truth', 'value', 'equal', 'b'],
    ['equal', 'result', 'correct', 'stream'],
    ['equal', 'result', 'total', 'stream'],
    ['correct', 'count', 'ratio', 'a'],
    ['total', 'count', 'ratio', 'b'],
    ['ratio', 'result', 'out', 'value'],
  ] as const
  for (const [fromNodeId, fromPortId, toNodeId, toPortId] of wires) {
    graph = connect(graph, { id: `${fromNodeId}-${toNodeId}`, fromNodeId, fromPortId, toNodeId, toPortId })
  }
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

  it('lets low-level stream primitives compose an accuracy-like ratio without an Accuracy node', () => {
    const graph = matchRatioGraph()
    expect(graph.nodes.some((node) => node.kind.includes('accuracy'))).toBe(false)
    const result = evaluateGraph(graph)
    expect(result.values[signalKey('equal', 'result')]).toEqual([true, false, false, true])
    expect(result.values[signalKey('correct', 'count')]).toBe(2)
    expect(result.values[signalKey('total', 'count')]).toBe(4)
    expect(result.values[signalKey('out', 'value')]).toBe(.5)
  })

  it('advances stream machines one sample clock at a time instead of revealing the whole stream at once', () => {
    const timeline = evaluateRuntimeTimeline(matchRatioGraph())
    expect(timeline).toHaveLength(4)
    expect(timeline[0].result.values[signalKey('equal', 'result')]).toEqual([true])
    expect(timeline[0].result.values[signalKey('correct', 'count')]).toBe(1)
    expect(timeline[0].result.values[signalKey('total', 'count')]).toBe(1)
    expect(timeline[0].result.values[signalKey('out', 'value')]).toBe(1)
    expect(timeline[1].result.values[signalKey('out', 'value')]).toBe(.5)
    expect(timeline[3].result.values[signalKey('out', 'value')]).toBe(.5)
  })

  it('steps through one node at a time inside each sample clock and preserves accumulator state', () => {
    const graph = matchRatioGraph()
    let session = createRuntimeSession(graph)
    const firstNode = stepRuntimeSession(graph, session)
    session = firstNode.session
    expect(firstNode.frame.sampleComplete).toBe(false)
    expect(firstNode.frame.nodeIndex).toBe(0)
    expect(firstNode.frame.result.steps[0].nodeId).toBe('predictions')
    expect(session.tick).toBe(0)
    expect(session.nodeIndex).toBe(1)
    expect(session.values[signalKey('predictions', 'value')]).toEqual([true])
    expect(session.values[signalKey('out', 'value')]).toBeUndefined()

    for (let index = 1; index < 7; index += 1) session = stepRuntimeSession(graph, session).session
    expect(session.tick).toBe(1)
    expect(session.nodeIndex).toBe(0)
    expect(session.values[signalKey('correct', 'count')]).toBe(1)
    expect(session.values[signalKey('total', 'count')]).toBe(1)
    expect(session.values[signalKey('out', 'value')]).toBe(1)

    for (let index = 0; index < 7; index += 1) session = stepRuntimeSession(graph, session).session
    expect(session.tick).toBe(2)
    expect(session.values[signalKey('equal', 'result')]).toEqual([true, false])
    expect(session.values[signalKey('correct', 'count')]).toBe(1)
    expect(session.values[signalKey('total', 'count')]).toBe(2)
    expect(session.values[signalKey('out', 'value')]).toBe(.5)
  })

  it('rejects elementwise stream comparison when the two streams have different lengths', () => {
    const graph = matchRatioGraph()
    graph.nodes = graph.nodes.map((node) => node.id === 'truth' ? { ...node, config: { values: [true] } } : node)
    expect(() => evaluateGraph(graph)).toThrow(/长度必须一致/)
  })

  it('runs completed output circuits while ignoring disconnected unfinished work-in-progress nodes', () => {
    const graph = thresholdGraph()
    graph.nodes.push(createNode('greater-than', 'unfinished', 0, 0))
    const result = evaluateGraph(graph)
    expect(result.steps.map((step) => step.nodeId)).not.toContain('unfinished')
    expect(result.values[signalKey('out', 'value')]).toBe(true)
  })

  it('derives the sample clock only from streams that feed an output circuit', () => {
    const graph = matchRatioGraph()
    graph.nodes.push({ ...createNode('boolean-stream-input', 'scratch', 0, 0), config: { values: [true] } })
    const timeline = evaluateRuntimeTimeline(graph)
    expect(timeline).toHaveLength(4)
    expect(timeline.at(-1)?.result.values[signalKey('out', 'value')]).toBe(.5)
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
