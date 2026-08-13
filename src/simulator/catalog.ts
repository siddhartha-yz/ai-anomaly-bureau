import type { PortSpec, SignalValue, SimulatorNode, SimulatorNodeKind } from './types'

export type NodeDefinition = {
  kind: SimulatorNodeKind
  title: string
  short: string
  inputs: readonly PortSpec[]
  outputs: readonly PortSpec[]
  defaultConfig?: SimulatorNode['config']
  evaluate: (inputs: Record<string, SignalValue>, node: SimulatorNode) => Record<string, SignalValue>
}

const input = (id: string, label: string, type: PortSpec['type']): PortSpec => ({ id, label, type, direction: 'input' })
const output = (id: string, label: string, type: PortSpec['type']): PortSpec => ({ id, label, type, direction: 'output' })

function booleanStream(value: SignalValue, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'boolean')) throw new Error(`${label} 需要 boolean stream。`)
  return value as readonly boolean[]
}

export const NODE_DEFINITIONS: Record<SimulatorNodeKind, NodeDefinition> = {
  'number-input': {
    kind: 'number-input',
    title: 'NUMBER INPUT',
    short: 'IN',
    inputs: [],
    outputs: [output('value', 'value', 'number')],
    defaultConfig: { value: .72, label: 'score' },
    evaluate: (_inputs, node) => ({ value: node.config?.value ?? 0 }),
  },
  constant: {
    kind: 'constant',
    title: 'CONSTANT',
    short: 'K',
    inputs: [],
    outputs: [output('value', 'value', 'number')],
    defaultConfig: { value: .6 },
    evaluate: (_inputs, node) => ({ value: node.config?.value ?? 0 }),
  },
  'greater-than': {
    kind: 'greater-than',
    title: 'GREATER THAN',
    short: '>',
    inputs: [input('a', 'a', 'number'), input('b', 'b', 'number')],
    outputs: [output('result', 'result', 'boolean')],
    evaluate: (inputs) => ({ result: Number(inputs.a) > Number(inputs.b) }),
  },
  'boolean-output': {
    kind: 'boolean-output',
    title: 'BOOLEAN OUTPUT',
    short: 'OUT',
    inputs: [input('value', 'value', 'boolean')],
    outputs: [output('value', 'value', 'boolean')],
    evaluate: (inputs) => ({ value: Boolean(inputs.value) }),
  },
  'boolean-stream-input': {
    kind: 'boolean-stream-input',
    title: 'BOOLEAN STREAM',
    short: 'BITS',
    inputs: [],
    outputs: [output('value', 'stream', 'boolean-stream')],
    defaultConfig: { values: [true, false, true, true, false, true] },
    evaluate: (_inputs, node) => ({ value: [...(node.config?.values ?? [])] }),
  },
  'stream-equal': {
    kind: 'stream-equal',
    title: 'STREAM EQUAL',
    short: '==',
    inputs: [input('a', 'a', 'boolean-stream'), input('b', 'b', 'boolean-stream')],
    outputs: [output('result', 'match', 'boolean-stream')],
    evaluate: (inputs) => {
      const a = booleanStream(inputs.a, 'STREAM EQUAL.a')
      const b = booleanStream(inputs.b, 'STREAM EQUAL.b')
      if (a.length !== b.length) throw new Error('STREAM EQUAL 两路 stream 长度必须一致。')
      return { result: a.map((value, index) => value === b[index]) }
    },
  },
  'stream-and': {
    kind: 'stream-and',
    title: 'STREAM AND',
    short: 'AND',
    inputs: [input('a', 'a', 'boolean-stream'), input('b', 'b', 'boolean-stream')],
    outputs: [output('result', 'result', 'boolean-stream')],
    evaluate: (inputs) => {
      const a = booleanStream(inputs.a, 'STREAM AND.a')
      const b = booleanStream(inputs.b, 'STREAM AND.b')
      if (a.length !== b.length) throw new Error('STREAM AND 两路 stream 长度必须一致。')
      return { result: a.map((value, index) => value && b[index]) }
    },
  },
  'count-true': {
    kind: 'count-true',
    title: 'COUNT TRUE',
    short: 'ΣT',
    inputs: [input('stream', 'stream', 'boolean-stream')],
    outputs: [output('count', 'count', 'number')],
    evaluate: (inputs) => ({ count: booleanStream(inputs.stream, 'COUNT TRUE.stream').filter(Boolean).length }),
  },
  'stream-length': {
    kind: 'stream-length',
    title: 'STREAM LENGTH',
    short: '#',
    inputs: [input('stream', 'stream', 'boolean-stream')],
    outputs: [output('count', 'length', 'number')],
    evaluate: (inputs) => ({ count: booleanStream(inputs.stream, 'STREAM LENGTH.stream').length }),
  },
  divide: {
    kind: 'divide',
    title: 'DIVIDE',
    short: '÷',
    inputs: [input('a', 'a', 'number'), input('b', 'b', 'number')],
    outputs: [output('result', 'result', 'number')],
    evaluate: (inputs) => {
      const denominator = Number(inputs.b)
      if (denominator === 0) throw new Error('DIVIDE.b 不能为 0。')
      return { result: Number(inputs.a) / denominator }
    },
  },
  'number-output': {
    kind: 'number-output',
    title: 'NUMBER OUTPUT',
    short: 'OUT#',
    inputs: [input('value', 'value', 'number')],
    outputs: [output('value', 'value', 'number')],
    evaluate: (inputs) => ({ value: Number(inputs.value) }),
  },
}

export const SIMULATOR_PALETTE: readonly SimulatorNodeKind[] = [
  'number-input',
  'constant',
  'greater-than',
  'boolean-output',
  'boolean-stream-input',
  'stream-equal',
  'stream-and',
  'count-true',
  'stream-length',
  'divide',
  'number-output',
]

export function nodeDefinition(node: SimulatorNode) {
  return NODE_DEFINITIONS[node.kind]
}
