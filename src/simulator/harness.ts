import { executionGraph } from './graph'
import { evaluateGraph } from './runtime'
import { signalKey, type SignalValue, type SimulatorGraph, type SimulatorNode } from './types'

export type SimulatorTestInput = {
  nodeId: string
  terminal?: string
  value: number | readonly number[] | readonly boolean[]
}

export type SimulatorTestExpectation = {
  nodeId: string
  terminal?: string
  value: number | boolean
}

export type SimulatorTestCase = {
  id: string
  name: string
  inputs: SimulatorTestInput[]
  expected: SimulatorTestExpectation[]
}

export type SimulatorTestResult = {
  id: string
  name: string
  passed: boolean
  outputs: { nodeId: string; terminal?: string; expected: number | boolean; actual?: number | boolean; passed: boolean }[]
  error?: string
}

const isHarnessInputNode = (node: SimulatorNode) => node.kind === 'number-input'
  || node.kind === 'number-stream-input'
  || node.kind === 'boolean-stream-input'

const isHarnessOutputNode = (node: SimulatorNode) => node.kind === 'boolean-output'
  || node.kind === 'number-output'

export function simulatorTerminalName(node: SimulatorNode) {
  const label = node.config?.label?.trim()
  return label || node.id
}

function uniqueTerminalNode(graph: SimulatorGraph, terminal: string, direction: 'input' | 'output') {
  const candidates = graph.nodes.filter((node) => (direction === 'input' ? isHarnessInputNode(node) : isHarnessOutputNode(node))
    && simulatorTerminalName(node) === terminal)
  if (candidates.length > 1) throw new Error(`TEST HARNESS: ${direction.toUpperCase()} terminal “${terminal}” 重复；端口名必须唯一。`)
  return candidates[0]
}

function resolveTestNode(graph: SimulatorGraph, nodeId: string, terminal: string | undefined, direction: 'input' | 'output') {
  if (terminal) {
    const byTerminal = uniqueTerminalNode(graph, terminal, direction)
    if (byTerminal) return byTerminal
    return undefined
  }
  const byId = graph.nodes.find((node) => node.id === nodeId)
  if (!byId || !(direction === 'input' ? isHarnessInputNode(byId) : isHarnessOutputNode(byId))) return undefined
  return byId
}

function cloneInputValue(value: SimulatorTestInput['value']): SimulatorTestInput['value'] {
  return Array.isArray(value) ? [...value] : value
}

function outputValue(graph: SimulatorGraph, nodeId: string, values: Record<string, SignalValue>) {
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node || (node.kind !== 'boolean-output' && node.kind !== 'number-output')) return undefined
  const value = values[signalKey(nodeId, 'value')]
  return typeof value === 'boolean' || typeof value === 'number' ? value : undefined
}

export function captureTestCase(graph: SimulatorGraph, id: string, name: string): SimulatorTestCase {
  const runnable = executionGraph(graph)
  const result = evaluateGraph(graph)
  const inputs: SimulatorTestInput[] = []
  for (const node of runnable.nodes) {
    const terminal = simulatorTerminalName(node)
    if (isHarnessInputNode(node)) uniqueTerminalNode(runnable, terminal, 'input')
    if (node.kind === 'number-input') inputs.push({ nodeId: node.id, terminal, value: node.config?.value ?? 0 })
    if (node.kind === 'number-stream-input') inputs.push({ nodeId: node.id, terminal, value: [...(node.config?.numberValues ?? [])] })
    if (node.kind === 'boolean-stream-input') inputs.push({ nodeId: node.id, terminal, value: [...(node.config?.values ?? [])] })
  }
  const expected: SimulatorTestExpectation[] = runnable.nodes
    .filter((node) => node.kind === 'boolean-output' || node.kind === 'number-output')
    .flatMap((node) => {
      const terminal = simulatorTerminalName(node)
      uniqueTerminalNode(runnable, terminal, 'output')
      const value = outputValue(runnable, node.id, result.values)
      return value === undefined ? [] : [{ nodeId: node.id, terminal, value }]
    })
  if (!expected.length) throw new Error('TEST BENCH 需要至少一个已接通的 BOOLEAN / NUMBER OUTPUT。')
  return { id, name: name.trim() || `TEST ${id}`, inputs, expected }
}

export function applyTestInputs(graph: SimulatorGraph, test: SimulatorTestCase): SimulatorGraph {
  const resolvedInputs = test.inputs.map((input) => {
    const node = resolveTestNode(graph, input.nodeId, input.terminal, 'input')
    if (!node) throw new Error(`TEST ${test.name}: 输入 ${input.terminal ?? input.nodeId} 已不存在。`)
    return { input, node }
  })
  const byId = new Map(resolvedInputs.map(({ input, node }) => [node.id, input]))
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const input = byId.get(node.id)
      if (!input) return node
      if (node.kind === 'number-input' && typeof input.value === 'number') return { ...node, config: { ...node.config, value: input.value } }
      if (node.kind === 'number-stream-input' && Array.isArray(input.value) && input.value.every((value) => typeof value === 'number')) {
        return { ...node, config: { ...node.config, numberValues: [...input.value] as number[] } }
      }
      if (node.kind === 'boolean-stream-input' && Array.isArray(input.value) && input.value.every((value) => typeof value === 'boolean')) {
        return { ...node, config: { ...node.config, values: [...input.value] as boolean[] } }
      }
      throw new Error(`TEST ${test.name}: 输入 ${node.id} 的类型已经和保存时不同。`)
    }),
  }
}

function valuesEqual(expected: number | boolean, actual: number | boolean | undefined) {
  if (typeof expected === 'number' && typeof actual === 'number') return Math.abs(expected - actual) <= 1e-9
  return expected === actual
}

export function runTestCase(graph: SimulatorGraph, test: SimulatorTestCase): SimulatorTestResult {
  try {
    const testGraph = applyTestInputs(graph, test)
    const values = evaluateGraph(testGraph).values
    const outputs = test.expected.map((expectation) => {
      const node = resolveTestNode(testGraph, expectation.nodeId, expectation.terminal, 'output')
      const actual = node ? outputValue(testGraph, node.id, values) : undefined
      return { nodeId: node?.id ?? expectation.nodeId, terminal: expectation.terminal, expected: expectation.value, actual, passed: valuesEqual(expectation.value, actual) }
    })
    return { id: test.id, name: test.name, passed: outputs.every((output) => output.passed), outputs }
  } catch (error) {
    return { id: test.id, name: test.name, passed: false, outputs: [], error: error instanceof Error ? error.message : '测试运行失败。' }
  }
}

export function runTestSuite(graph: SimulatorGraph, tests: readonly SimulatorTestCase[]) {
  return tests.map((test) => runTestCase(graph, test))
}

export function parseTestCases(raw: string | null): SimulatorTestCase[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SimulatorTestCase => {
      if (!item || typeof item !== 'object') return false
      const test = item as Partial<SimulatorTestCase>
      return typeof test.id === 'string'
        && typeof test.name === 'string'
        && Array.isArray(test.inputs)
        && test.inputs.every((input) => {
          if (!input || typeof input !== 'object' || typeof input.nodeId !== 'string') return false
          if ('terminal' in input && input.terminal !== undefined && typeof input.terminal !== 'string') return false
          if (typeof input.value === 'number') return Number.isFinite(input.value)
          if (!Array.isArray(input.value)) return false
          return input.value.every((value) => typeof value === 'boolean')
            || input.value.every((value) => typeof value === 'number' && Number.isFinite(value))
        })
        && Array.isArray(test.expected)
        && test.expected.every((output) => output && typeof output === 'object' && typeof output.nodeId === 'string'
          && (!('terminal' in output) || output.terminal === undefined || typeof output.terminal === 'string')
          && (typeof output.value === 'boolean' || (typeof output.value === 'number' && Number.isFinite(output.value))))
    }).map((test) => ({
      ...test,
      inputs: test.inputs.map((input) => ({ ...input, value: cloneInputValue(input.value) })),
      expected: test.expected.map((output) => ({ ...output })),
    }))
  } catch {
    return []
  }
}
