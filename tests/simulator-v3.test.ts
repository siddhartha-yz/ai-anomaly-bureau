import { describe, expect, it } from 'vitest'
import { createBlueprint, instantiateBlueprint } from '../src/simulator/blueprints'
import { createComponentDefinition, editComponentInterface, forkComponentDefinition, instantiateComponent, moveComponentInstance, removeComponentInstance, restoreComponentInstance, unpackComponentInstance, updateComponentDefinitionFromInstance } from '../src/simulator/components'
import { canConnect, connect, createEmptyGraph, createNode, topologicalOrder } from '../src/simulator/graph'
import { applyGraphEdit, createGraphHistory, recordGraphSnapshot, redoGraph, undoGraph } from '../src/simulator/history'
import { applyTestInputs, captureTestCase, parseTestCases, runTestSuite } from '../src/simulator/harness'
import { createRuntimeSession, evaluateGraph, evaluateRuntimeTimeline, runtimeCursorNodeId, stepRuntimeSession, visibleValuesAfterStep } from '../src/simulator/runtime'
import { collectSignalProbeReadings, latestSignalValue, matchingSignalProbeBreak, signalProbeConditionMatches } from '../src/simulator/probes'
import { moveSelectedUnits, selectVisibleUnitsInRect } from '../src/simulator/selection'
import { signalKey, type SimulatorGraph } from '../src/simulator/types'
import { MAX_SIM_ZOOM, MIN_SIM_ZOOM, fitViewport, panViewport, zoomViewportAtPoint } from '../src/simulator/viewport'

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

function recallLikeGraph(): SimulatorGraph {
  let graph: SimulatorGraph = {
    nodes: [
      { ...createNode('boolean-stream-input', 'predictions', 0, 0), config: { values: [true, false, true, true] } },
      { ...createNode('boolean-stream-input', 'truthPositive', 0, 0), config: { values: [true, true, false, true] } },
      createNode('stream-and', 'truePositive', 0, 0),
      createNode('count-true', 'caught', 0, 0),
      createNode('count-true', 'positiveTotal', 0, 0),
      createNode('divide', 'ratio', 0, 0),
      createNode('number-output', 'out', 0, 0),
    ],
    wires: [],
  }
  const wires = [
    ['predictions', 'value', 'truePositive', 'a'],
    ['truthPositive', 'value', 'truePositive', 'b'],
    ['truePositive', 'result', 'caught', 'stream'],
    ['truthPositive', 'value', 'positiveTotal', 'stream'],
    ['caught', 'count', 'ratio', 'a'],
    ['positiveTotal', 'count', 'ratio', 'b'],
    ['ratio', 'result', 'out', 'value'],
  ] as const
  for (const [fromNodeId, fromPortId, toNodeId, toPortId] of wires) {
    graph = connect(graph, { id: `${fromNodeId}-${toNodeId}-${toPortId}`, fromNodeId, fromPortId, toNodeId, toPortId })
  }
  return graph
}


function scoreThresholdGraph(): SimulatorGraph {
  let graph: SimulatorGraph = {
    nodes: [
      { ...createNode('number-stream-input', 'scores', 0, 0), config: { numberValues: [.72, .31, .88, .54] } },
      { ...createNode('constant', 'threshold', 0, 0), config: { value: .6 } },
      createNode('stream-greater-than', 'decide', 0, 0),
      createNode('count-true', 'positiveCount', 0, 0),
      createNode('number-output', 'out', 0, 0),
    ],
    wires: [],
  }
  const wires = [
    ['scores', 'value', 'decide', 'stream'],
    ['threshold', 'value', 'decide', 'threshold'],
    ['decide', 'result', 'positiveCount', 'stream'],
    ['positiveCount', 'count', 'out', 'value'],
  ] as const
  for (const [fromNodeId, fromPortId, toNodeId, toPortId] of wires) {
    graph = connect(graph, { id: `${fromNodeId}-${toNodeId}-${toPortId}`, fromNodeId, fromPortId, toNodeId, toPortId })
  }
  return graph
}

function mixedSelectionGraph() {
  const source = thresholdGraph()
  const definition = createComponentDefinition(source, ['gt'], 'component-1', 'THRESHOLD CORE')
  let graph = { ...createEmptyGraph(), nodes: [createNode('number-input', 'loose', 40, 40)] }
  graph = instantiateComponent(graph, definition, { x: 330, y: 160 })
  return graph
}


describe('Simulator V3 viewport camera', () => {
  it('zooms around the pointer without moving the world point under the cursor', () => {
    const start = { zoom: .75, panX: 18, panY: 18 }
    const pointer = { x: 400, y: 260 }
    const worldBefore = {
      x: (pointer.x - start.panX) / start.zoom,
      y: (pointer.y - start.panY) / start.zoom,
    }
    const next = zoomViewportAtPoint(start, 1.25, pointer.x, pointer.y)
    expect((pointer.x - next.panX) / next.zoom).toBeCloseTo(worldBefore.x)
    expect((pointer.y - next.panY) / next.zoom).toBeCloseTo(worldBefore.y)
  })

  it('clamps zoom, pans independently of graph data, and can fit the whole construction world', () => {
    expect(zoomViewportAtPoint({ zoom: 1, panX: 0, panY: 0 }, 99, 0, 0).zoom).toBe(MAX_SIM_ZOOM)
    expect(zoomViewportAtPoint({ zoom: 1, panX: 0, panY: 0 }, .01, 0, 0).zoom).toBe(MIN_SIM_ZOOM)
    expect(panViewport({ zoom: .75, panX: 10, panY: 20 }, 30, -5)).toEqual({ zoom: .75, panX: 40, panY: 15 })
    const fitted = fitViewport(1000, 620, 2200, 1400)
    expect(fitted.zoom).toBeCloseTo(556 / 1400)
    expect(fitted.panX).toBeCloseTo((1000 - 2200 * fitted.zoom) / 2)
    expect(fitted.panY).toBeCloseTo(32)
  })
})

describe('Simulator V3 signal probes', () => {
  it('tracks the latest sample on a watched stream wire without losing its accumulated history', () => {
    const graph = scoreThresholdGraph()
    const values = evaluateGraph(graph).values
    const readings = collectSignalProbeReadings(graph, ['scores-decide-stream', 'missing'], values)
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({
      from: 'scores.value',
      to: 'decide.stream',
      sampleCount: 4,
      latest: .54,
    })
    expect(readings[0].value).toEqual([.72, .31, .88, .54])
    expect(latestSignalValue([true, false, true])).toBe(true)
  })

  it('can turn a watched signal into a conditional playback break without changing graph semantics', () => {
    const graph = scoreThresholdGraph()
    expect(signalProbeConditionMatches({ mode: 'number-at-least', threshold: .8 }, [.72, .31, .88])).toBe(true)
    expect(signalProbeConditionMatches({ mode: 'number-at-most', threshold: .3 }, [.72, .31, .88])).toBe(false)
    expect(signalProbeConditionMatches({ mode: 'boolean', value: false }, [true, false])).toBe(true)

    const values = evaluateRuntimeTimeline(graph)[2].result.values
    const match = matchingSignalProbeBreak(
      graph,
      { 'scores-decide-stream': { mode: 'number-at-least', threshold: .8 } },
      values,
      'scores',
    )
    expect(match).toMatchObject({ wireId: 'scores-decide-stream', latest: .88 })
    expect(matchingSignalProbeBreak(graph, { 'scores-decide-stream': { mode: 'number-at-least', threshold: .8 } }, values, 'decide')).toBeUndefined()
  })
})

describe('Simulator V3 wiring guards', () => {
  it('rejects a feedback wire before it can create a cycle in the editable graph', () => {
    let graph: SimulatorGraph = {
      nodes: [
        createNode('boolean-output', 'relayA', 0, 0),
        createNode('boolean-output', 'relayB', 0, 0),
      ],
      wires: [],
    }
    graph = connect(graph, { id: 'a-to-b', fromNodeId: 'relayA', fromPortId: 'value', toNodeId: 'relayB', toPortId: 'value' })

    const check = canConnect(graph, { nodeId: 'relayB', portId: 'value' }, { nodeId: 'relayA', portId: 'value' })
    expect(check).toEqual({ ok: false, reason: '这根线会形成环路；当前模拟器只允许无环数据流。' })
    expect(() => connect(graph, { id: 'b-to-a', fromNodeId: 'relayB', fromPortId: 'value', toNodeId: 'relayA', toPortId: 'value' })).toThrow(/环路/)
  })
})

describe('Simulator V3 board selection', () => {
  it('marquee-selects visible primitives and black boxes without leaking their hidden internals', () => {
    const graph = mixedSelectionGraph()
    const selected = selectVisibleUnitsInRect(graph, { x1: 20, y1: 20, x2: 540, y2: 320 }, { width: 164, height: 104 }, { width: 190, height: 118 })
    expect(selected.nodeIds).toEqual(['loose'])
    expect(selected.componentInstanceIds).toHaveLength(1)
    const hiddenNodeId = graph.components![0].nodeIds[0]
    expect(selected.nodeIds).not.toContain(hiddenNodeId)
  })

  it('moves a mixed multi-selection as one rigid group, including black-box internals', () => {
    const graph = mixedSelectionGraph()
    const instance = graph.components?.[0]
    expect(instance).toBeDefined()
    const hiddenNodeId = instance!.nodeIds[0]
    const hiddenBefore = graph.nodes.find((node) => node.id === hiddenNodeId)!
    const moved = moveSelectedUnits(graph, ['loose'], [instance!.id], 70, -20)
    expect(moved.nodes.find((node) => node.id === 'loose')).toMatchObject({ x: 110, y: 20 })
    expect(moved.components?.[0]).toMatchObject({ x: 400, y: 140 })
    expect(moved.nodes.find((node) => node.id === hiddenNodeId)).toMatchObject({ x: hiddenBefore.x + 70, y: hiddenBefore.y - 20 })
  })
})

describe('Simulator V3 graph edit history', () => {
  it('undoes and redoes structural edits without losing the redo branch until a new edit occurs', () => {
    const empty = createEmptyGraph()
    const oneNode = { ...empty, nodes: [createNode('number-input', 'score', 20, 30)] }
    const twoNodes = { ...oneNode, nodes: [...oneNode.nodes, createNode('boolean-output', 'out', 300, 30)] }
    let history = createGraphHistory(empty)
    history = applyGraphEdit(history, oneNode)
    history = applyGraphEdit(history, twoNodes)
    expect(history.present.nodes).toHaveLength(2)
    history = undoGraph(history)
    expect(history.present.nodes.map((node) => node.id)).toEqual(['score'])
    history = redoGraph(history)
    expect(history.present.nodes).toHaveLength(2)
    history = undoGraph(history)
    history = applyGraphEdit(history, { ...history.present, nodes: [...history.present.nodes, createNode('constant', 'threshold', 80, 80)] })
    expect(history.future).toHaveLength(0)
    expect(redoGraph(history)).toBe(history)
  })

  it('records one drag snapshot while allowing transient positions to update freely', () => {
    const start = { ...createEmptyGraph(), nodes: [createNode('number-input', 'score', 20, 30)] }
    const moved = { ...start, nodes: start.nodes.map((node) => ({ ...node, x: 400, y: 250 })) }
    let history = createGraphHistory(moved)
    history = recordGraphSnapshot(history, start)
    expect(undoGraph(history).present.nodes[0]).toMatchObject({ x: 20, y: 30 })
  })
})

describe('Simulator V3 pure graph/runtime', () => {
  it('captures runnable source inputs and frozen output expectations as simulator-native test cases', () => {
    const graph = thresholdGraph()
    const test = captureTestCase(graph, 't1', 'threshold true')
    expect(test.inputs).toEqual([{ nodeId: 'score', terminal: 'score', value: .72 }])
    expect(test.expected).toEqual([{ nodeId: 'out', terminal: 'decision', value: true }])
    expect(parseTestCases(JSON.stringify([test]))).toEqual([test])
  })

  it('keeps a test suite valid when the player rebuilds the machine with new node ids but the same named I/O contract', () => {
    const graph = thresholdGraph()
    graph.nodes = graph.nodes.map((node) => node.id === 'score'
      ? { ...node, config: { ...node.config, label: 'score' } }
      : node.id === 'out' ? { ...node, config: { ...node.config, label: 'decision' } } : node)
    const test = captureTestCase(graph, 't1', 'stable interface')

    const renamedIds: Record<string, string> = { score: 'input_v2', threshold: 'constant_v2', gt: 'compare_v2', out: 'output_v2' }
    const rebuilt: SimulatorGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, id: renamedIds[node.id] ?? node.id })),
      wires: graph.wires.map((wire) => ({
        ...wire,
        id: `rebuilt-${wire.id}`,
        fromNodeId: renamedIds[wire.fromNodeId] ?? wire.fromNodeId,
        toNodeId: renamedIds[wire.toNodeId] ?? wire.toNodeId,
      })),
    }

    const [result] = runTestSuite(rebuilt, [test])
    expect(result.passed).toBe(true)
    expect(result.outputs[0]).toMatchObject({ terminal: 'decision', nodeId: 'output_v2', actual: true })
  })

  it('rejects ambiguous named terminals instead of silently binding a test to the wrong source', () => {
    let graph = thresholdGraph()
    graph.nodes.push({ ...createNode('number-input', 'other-score', 0, 0), config: { value: .1, label: 'score' } })
    graph.nodes.push(createNode('greater-than', 'other-gt', 0, 0), createNode('boolean-output', 'other-out', 0, 0))
    graph = connect(graph, { id: 'other-w1', fromNodeId: 'other-score', fromPortId: 'value', toNodeId: 'other-gt', toPortId: 'a' })
    graph = connect(graph, { id: 'other-w2', fromNodeId: 'threshold', fromPortId: 'value', toNodeId: 'other-gt', toPortId: 'b' })
    graph = connect(graph, { id: 'other-w3', fromNodeId: 'other-gt', fromPortId: 'result', toNodeId: 'other-out', toPortId: 'value' })
    expect(() => captureTestCase(graph, 't1', 'ambiguous')).toThrow(/terminal.*score.*重复/)
  })

  it('replays saved inputs against an edited machine and reports behavioral regressions', () => {
    const graph = thresholdGraph()
    const passCase = captureTestCase(graph, 't1', 'score .72')
    const lowInput = applyTestInputs(graph, { ...passCase, inputs: [{ nodeId: 'score', value: .42 }] })
    const failCase = captureTestCase(lowInput, 't2', 'score .42')
    expect(runTestSuite(graph, [passCase, failCase]).map((result) => result.passed)).toEqual([true, true])

    const stricter = {
      ...graph,
      nodes: graph.nodes.map((node) => node.id === 'threshold' ? { ...node, config: { ...node.config, value: .8 } } : node),
    }
    const results = runTestSuite(stricter, [passCase, failCase])
    expect(results.map((result) => result.passed)).toEqual([false, true])
    expect(results[0].outputs[0]).toMatchObject({ expected: true, actual: false, passed: false })
  })

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

  it('turns a number score stream into boolean decisions one sample at a time', () => {
    const graph = scoreThresholdGraph()
    const result = evaluateGraph(graph)
    expect(result.values[signalKey('decide', 'result')]).toEqual([true, false, true, false])
    expect(result.values[signalKey('out', 'value')]).toBe(2)

    const timeline = evaluateRuntimeTimeline(graph)
    expect(timeline).toHaveLength(4)
    expect(timeline[0].result.values[signalKey('scores', 'value')]).toEqual([.72])
    expect(timeline[0].result.values[signalKey('decide', 'result')]).toEqual([true])
    expect(timeline[1].result.values[signalKey('decide', 'result')]).toEqual([true, false])
    expect(timeline.at(-1)?.result.values[signalKey('out', 'value')]).toBe(2)
  })

  it('requires all connected number and boolean stream sources to share one sample clock', () => {
    let graph = scoreThresholdGraph()
    graph.nodes.push({ ...createNode('boolean-stream-input', 'truth', 0, 0), config: { values: [true] } })
    graph.nodes.push(createNode('stream-and', 'join', 0, 0))
    graph.nodes.push(createNode('count-true', 'joinedCount', 0, 0))
    graph.nodes.push(createNode('number-output', 'joinedOut', 0, 0))
    graph = connect(graph, { id: 'mix1', fromNodeId: 'decide', fromPortId: 'result', toNodeId: 'join', toPortId: 'a' })
    graph = connect(graph, { id: 'mix2', fromNodeId: 'truth', fromPortId: 'value', toNodeId: 'join', toPortId: 'b' })
    graph = connect(graph, { id: 'mix3', fromNodeId: 'join', fromPortId: 'result', toNodeId: 'joinedCount', toPortId: 'stream' })
    graph = connect(graph, { id: 'mix4', fromNodeId: 'joinedCount', fromPortId: 'count', toNodeId: 'joinedOut', toPortId: 'value' })
    expect(() => createRuntimeSession(graph)).toThrow(/STREAM SOURCE.*相同长度/)
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

  it('lets players compose a recall-like conditional metric without a Recall node', () => {
    const graph = recallLikeGraph()
    expect(graph.nodes.some((node) => node.kind.includes('recall'))).toBe(false)
    const result = evaluateGraph(graph)
    expect(result.values[signalKey('truePositive', 'result')]).toEqual([true, false, false, true])
    expect(result.values[signalKey('caught', 'count')]).toBe(2)
    expect(result.values[signalKey('positiveTotal', 'count')]).toBe(3)
    expect(result.values[signalKey('out', 'value')]).toBeCloseTo(2 / 3)
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

  it('exposes the exact next node so playback can pause before a breakpoint executes', () => {
    const graph = matchRatioGraph()
    let session = createRuntimeSession(graph)
    expect(runtimeCursorNodeId(graph, session)).toBe('predictions')
    session = stepRuntimeSession(graph, session).session
    expect(runtimeCursorNodeId(graph, session)).toBe('truth')
    for (let index = 1; index < 7; index += 1) session = stepRuntimeSession(graph, session).session
    expect(session.tick).toBe(1)
    expect(runtimeCursorNodeId(graph, session)).toBe('predictions')
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
  it('saves selected nodes as a reusable blueprint and preserves only internal wires', () => {
    const graph = recallLikeGraph()
    const blueprint = createBlueprint(graph, ['truePositive', 'caught', 'positiveTotal', 'ratio'], 'bp1', 'conditional ratio')
    expect(blueprint.nodes).toHaveLength(4)
    expect(blueprint.wires.map((wire) => `${wire.fromNodeId}->${wire.toNodeId}`)).toEqual([
      'truePositive->caught',
      'caught->ratio',
      'positiveTotal->ratio',
    ])
    expect(Math.min(...blueprint.nodes.map((node) => node.x))).toBe(0)
    expect(Math.min(...blueprint.nodes.map((node) => node.y))).toBe(0)
  })

  it('instantiates a blueprint with fresh node ids while keeping its internal topology', () => {
    const base = thresholdGraph()
    const blueprint = createBlueprint(base, ['gt', 'out'], 'bp2', 'gate')
    const expanded = instantiateBlueprint(base, blueprint, { x: 300, y: 120 })
    expect(expanded.nodes).toHaveLength(base.nodes.length + 2)
    expect(expanded.wires).toHaveLength(base.wires.length + 1)
    const copiedGt = expanded.nodes.find((node) => node.id.startsWith('gt_copy'))
    const copiedOut = expanded.nodes.find((node) => node.id.startsWith('out_copy'))
    expect(copiedGt).toBeTruthy()
    expect(copiedOut).toBeTruthy()
    expect(expanded.wires.some((wire) => wire.fromNodeId === copiedGt?.id && wire.toNodeId === copiedOut?.id)).toBe(true)
  })

  it('infers typed black-box boundaries around internal wiring, not around every primitive port', () => {
    const graph = thresholdGraph()
    const component = createComponentDefinition(graph, ['threshold', 'gt'], 'cmp1', 'threshold gate')
    expect(component.ports.map((port) => `${port.direction}:${port.label}:${port.type}`)).toEqual([
      'input:a:number',
      'output:result:boolean',
    ])
    expect(component.nodes).toHaveLength(2)
    expect(component.wires).toHaveLength(1)
  })

  it('lets the player rename a component interface without changing its electrical boundary', () => {
    const graph = thresholdGraph()
    const component = createComponentDefinition(graph, ['threshold', 'gt'], 'cmp_named', 'threshold gate')
    const edited = editComponentInterface(component, {
      name: 'RISK GATE',
      portLabels: { in_1: 'score', out_1: 'flag' },
    })
    expect(edited.name).toBe('RISK GATE')
    expect(edited.ports.map((port) => [port.id, port.label, port.type, port.nodeId, port.portId])).toEqual([
      ['in_1', 'score', 'number', 'gt', 'a'],
      ['out_1', 'flag', 'boolean', 'gt', 'result'],
    ])
    expect(edited.nodes).toEqual(component.nodes)
    expect(edited.wires).toEqual(component.wires)
  })

  it('updates a component library definition without silently migrating older placed instances', () => {
    const source = thresholdGraph()
    const definition = createComponentDefinition(source, ['threshold', 'gt'], 'cmp_update', 'threshold gate')
    let graph = instantiateComponent(createEmptyGraph(), definition, { x: 200, y: 100 })
    graph = instantiateComponent(graph, definition, { x: 500, y: 100 })
    const first = graph.components![0]
    const second = graph.components![1]
    const opened = unpackComponentInstance(graph, first.id)
    const thresholdNodeId = first.nodeIds.find((nodeId) => opened.nodes.find((node) => node.id === nodeId)?.kind === 'constant')!
    const edited = {
      ...opened,
      nodes: opened.nodes.map((node) => node.id === thresholdNodeId ? { ...node, config: { ...node.config, value: .8 } } : node),
    }
    const updated = updateComponentDefinitionFromInstance(edited, first, definition)
    expect(updated.id).toBe(definition.id)
    expect(updated.revision).toBe(2)
    expect(updated.ports.map((port) => [port.id, port.label, port.type])).toEqual(definition.ports.map((port) => [port.id, port.label, port.type]))
    expect(updated.nodes.find((node) => node.kind === 'constant')?.config?.value).toBe(.8)
    expect(second.definitionRevision).toBe(1)
    expect(edited.nodes.find((node) => node.id === second.nodeIds.find((id) => edited.nodes.find((node) => node.id === id)?.kind === 'constant'))?.config?.value).toBe(.6)
    const withNew = instantiateComponent(edited, updated, { x: 800, y: 100 })
    expect(withNew.components?.at(-1)?.definitionRevision).toBe(2)
  })

  it('refuses an in-place definition update when the public typed boundary changes', () => {
    const source = thresholdGraph()
    const definition = createComponentDefinition(source, ['threshold', 'gt'], 'cmp_boundary', 'threshold gate')
    let graph = instantiateComponent(createEmptyGraph(), definition, { x: 200, y: 100 })
    const instance = graph.components![0]
    graph = unpackComponentInstance(graph, instance.id)
    const boundaryNodeId = instance.boundaryMap.in_1.nodeId
    graph = {
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== boundaryNodeId),
      wires: graph.wires.filter((wire) => wire.fromNodeId !== boundaryNodeId && wire.toNodeId !== boundaryNodeId),
    }
    expect(() => updateComponentDefinitionFromInstance(graph, instance, definition)).toThrow(/边界端口|typed boundary/)
  })

  it('runs an instantiated player component through its exposed boundary ports', () => {
    const source = thresholdGraph()
    const definition = createComponentDefinition(source, ['threshold', 'gt'], 'cmp2', 'threshold gate')
    let graph: SimulatorGraph = {
      nodes: [
        { ...createNode('number-input', 'score2', 0, 0), config: { value: .72 } },
        createNode('boolean-output', 'out2', 0, 0),
      ],
      wires: [],
      components: [],
    }
    graph = instantiateComponent(graph, definition, { x: 200, y: 100 })
    const instance = graph.components?.[0]
    expect(instance).toBeTruthy()
    const inputA = instance!.boundaryMap.in_1
    const result = instance!.boundaryMap.out_1
    graph = connect(graph, { id: 'ca', fromNodeId: 'score2', fromPortId: 'value', toNodeId: inputA.nodeId, toPortId: inputA.portId })
    graph = connect(graph, { id: 'co', fromNodeId: result.nodeId, fromPortId: result.portId, toNodeId: 'out2', toPortId: 'value' })
    expect(evaluateGraph(graph).values[signalKey('out2', 'value')]).toBe(true)
  })

  it('opens a black box back into editable primitives without changing circuit behavior', () => {
    const source = thresholdGraph()
    const definition = createComponentDefinition(source, ['threshold', 'gt'], 'cmp_open', 'threshold gate')
    let graph: SimulatorGraph = {
      nodes: [
        { ...createNode('number-input', 'score_open', 0, 0), config: { value: .72 } },
        createNode('boolean-output', 'out_open', 0, 0),
      ],
      wires: [],
      components: [],
    }
    graph = instantiateComponent(graph, definition, { x: 200, y: 100 })
    const instance = graph.components![0]
    graph = connect(graph, { id: 'open-in', fromNodeId: 'score_open', fromPortId: 'value', toNodeId: instance.boundaryMap.in_1.nodeId, toPortId: instance.boundaryMap.in_1.portId })
    graph = connect(graph, { id: 'open-out', fromNodeId: instance.boundaryMap.out_1.nodeId, fromPortId: instance.boundaryMap.out_1.portId, toNodeId: 'out_open', toPortId: 'value' })
    expect(evaluateGraph(graph).values[signalKey('out_open', 'value')]).toBe(true)

    const opened = unpackComponentInstance(graph, instance.id)
    expect(opened.components).toHaveLength(0)
    expect(opened.nodes.filter((node) => instance.nodeIds.includes(node.id)).every((node) => !node.componentInstanceId)).toBe(true)
    expect(opened.wires).toHaveLength(graph.wires.length)
    expect(evaluateGraph(opened).values[signalKey('out_open', 'value')]).toBe(true)

    const internalConstant = opened.nodes.find((node) => instance.nodeIds.includes(node.id) && node.kind === 'constant')!
    const edited = { ...opened, nodes: opened.nodes.map((node) => node.id === internalConstant.id ? { ...node, config: { value: .8 } } : node) }
    expect(evaluateGraph(edited).values[signalKey('out_open', 'value')]).toBe(false)

    const closed = restoreComponentInstance(edited, instance)
    expect(closed.components).toEqual([instance])
    expect(closed.nodes.filter((node) => instance.nodeIds.includes(node.id)).every((node) => node.componentInstanceId === instance.id)).toBe(true)
    expect(closed.wires).toHaveLength(graph.wires.length)
    expect(evaluateGraph(closed).values[signalKey('out_open', 'value')]).toBe(false)
  })

  it('forks an edited instance into a new reusable definition without mutating the source component', () => {
    const source = editComponentInterface(
      createComponentDefinition(thresholdGraph(), ['threshold', 'gt'], 'cmp_source', 'threshold gate'),
      { name: 'RISK GATE', portLabels: { in_1: 'score', out_1: 'flag' } },
    )
    let graph = instantiateComponent(createEmptyGraph(), source)
    const instance = graph.components![0]
    graph = unpackComponentInstance(graph, instance.id)
    const internalConstant = graph.nodes.find((node) => instance.nodeIds.includes(node.id) && node.kind === 'constant')!
    graph = {
      ...graph,
      nodes: graph.nodes.map((node) => node.id === internalConstant.id ? { ...node, config: { value: .8 } } : node),
    }

    const fork = forkComponentDefinition(graph, instance, source, 'cmp_fork', 'STRICT RISK GATE')
    expect(source.nodes.find((node) => node.kind === 'constant')?.config?.value).toBe(.6)
    expect(fork.nodes.find((node) => node.kind === 'constant')?.config?.value).toBe(.8)
    expect(fork.name).toBe('STRICT RISK GATE')
    expect(fork.ports.map((port) => port.label)).toEqual(['score', 'flag'])

    let testGraph: SimulatorGraph = {
      nodes: [{ ...createNode('number-input', 'score_fork', 0, 0), config: { value: .72 } }, createNode('boolean-output', 'out_fork', 0, 0)],
      wires: [],
      components: [],
    }
    testGraph = instantiateComponent(testGraph, fork)
    const forkInstance = testGraph.components![0]
    testGraph = connect(testGraph, { id: 'fork-in', fromNodeId: 'score_fork', fromPortId: 'value', toNodeId: forkInstance.boundaryMap.in_1.nodeId, toPortId: forkInstance.boundaryMap.in_1.portId })
    testGraph = connect(testGraph, { id: 'fork-out', fromNodeId: forkInstance.boundaryMap.out_1.nodeId, fromPortId: forkInstance.boundaryMap.out_1.portId, toNodeId: 'out_fork', toPortId: 'value' })
    expect(evaluateGraph(testGraph).values[signalKey('out_fork', 'value')]).toBe(false)
  })

  it('refuses to close an opened component after one of its original internal nodes was deleted', () => {
    const definition = createComponentDefinition(thresholdGraph(), ['threshold', 'gt'], 'cmp_broken_scope', 'threshold gate')
    const graph = instantiateComponent(createEmptyGraph(), definition)
    const instance = graph.components![0]
    const opened = unpackComponentInstance(graph, instance.id)
    const broken = { ...opened, nodes: opened.nodes.filter((node) => node.id !== instance.nodeIds[0]) }
    expect(() => restoreComponentInstance(broken, instance)).toThrow(/内部节点已被删除/)
  })

  it('moves and deletes a component instance as one construction unit', () => {
    const definition = createComponentDefinition(thresholdGraph(), ['gt', 'out'], 'cmp3', 'gate output')
    let graph = instantiateComponent(createEmptyGraph(), definition, { x: 120, y: 80 })
    const instance = graph.components?.[0]
    expect(instance).toBeTruthy()
    const original = graph.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))
    graph = moveComponentInstance(graph, instance!.id, 220, 180)
    for (const before of original) {
      const after = graph.nodes.find((node) => node.id === before.id)!
      expect(after.x - before.x).toBe(100)
      expect(after.y - before.y).toBe(100)
    }
    graph = removeComponentInstance(graph, instance!.id)
    expect(graph.nodes).toHaveLength(0)
    expect(graph.wires).toHaveLength(0)
    expect(graph.components).toHaveLength(0)
  })


  it('can build a higher-level component from a complete player-built component plus new primitives', () => {
    const source = thresholdGraph()
    const threshold = createComponentDefinition(source, ['threshold', 'gt'], 'cmp_base', 'threshold gate')

    let graph: SimulatorGraph = {
      nodes: [createNode('boolean-output', 'finalOut', 0, 0)],
      wires: [],
      components: [],
    }
    graph = instantiateComponent(graph, threshold, { x: 120, y: 80 })
    const instance = graph.components![0]
    const output = instance.boundaryMap.out_1
    graph = connect(graph, { id: 'outer-wire', fromNodeId: output.nodeId, fromPortId: output.portId, toNodeId: 'finalOut', toPortId: 'value' })

    const higher = createComponentDefinition(graph, [...instance.nodeIds, 'finalOut'], 'cmp_higher', 'threshold output')
    expect(higher.nodes).toHaveLength(3)
    expect(higher.nodes.every((node) => !node.componentInstanceId)).toBe(true)
    expect(higher.ports.map((port) => `${port.direction}:${port.type}`).sort()).toEqual(['input:number', 'output:boolean'])

    let graph2: SimulatorGraph = {
      nodes: [{ ...createNode('number-input', 'score3', 0, 0), config: { value: .72 } }, createNode('boolean-output', 'out3', 0, 0)],
      wires: [],
      components: [],
    }
    graph2 = instantiateComponent(graph2, higher, { x: 200, y: 100 })
    const nested = graph2.components![0]
    graph2 = connect(graph2, { id: 'hi-in', fromNodeId: 'score3', fromPortId: 'value', toNodeId: nested.boundaryMap.in_1.nodeId, toPortId: nested.boundaryMap.in_1.portId })
    graph2 = connect(graph2, { id: 'hi-out', fromNodeId: nested.boundaryMap.out_1.nodeId, fromPortId: nested.boundaryMap.out_1.portId, toNodeId: 'out3', toPortId: 'value' })
    expect(evaluateGraph(graph2).values[signalKey('out3', 'value')]).toBe(true)
  })

  it('refuses to pierce a black-box boundary by re-encapsulating only part of an instance', () => {
    const definition = createComponentDefinition(thresholdGraph(), ['threshold', 'gt'], 'cmp_partial', 'threshold gate')
    const graph = instantiateComponent(createEmptyGraph(), definition)
    const instance = graph.components![0]
    expect(() => createComponentDefinition(graph, [instance.nodeIds[0]], 'bad', 'partial')).toThrow(/完整黑盒/)
  })

})
