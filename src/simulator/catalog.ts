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
}

export const SIMULATOR_PALETTE: readonly SimulatorNodeKind[] = [
  'number-input',
  'constant',
  'greater-than',
  'boolean-output',
]

export function nodeDefinition(node: SimulatorNode) {
  return NODE_DEFINITIONS[node.kind]
}
