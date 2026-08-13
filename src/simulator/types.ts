export type SignalType = 'number' | 'boolean' | 'boolean-stream'
export type SignalValue = number | boolean | readonly boolean[]

export type PortDirection = 'input' | 'output'

export type PortSpec = {
  id: string
  label: string
  type: SignalType
  direction: PortDirection
}

export type SimulatorNodeKind =
  | 'number-input'
  | 'constant'
  | 'greater-than'
  | 'boolean-output'
  | 'boolean-stream-input'
  | 'stream-equal'
  | 'count-true'
  | 'stream-length'
  | 'divide'
  | 'number-output'

export type SimulatorNode = {
  id: string
  kind: SimulatorNodeKind
  x: number
  y: number
  config?: {
    value?: number
    label?: string
    values?: boolean[]
  }
}

export type SimulatorWire = {
  id: string
  fromNodeId: string
  fromPortId: string
  toNodeId: string
  toPortId: string
}

export type SimulatorGraph = {
  nodes: SimulatorNode[]
  wires: SimulatorWire[]
}

export type PortAddress = {
  nodeId: string
  portId: string
}

export type RuntimeStep = {
  nodeId: string
  outputs: Record<string, SignalValue>
}

export type RuntimeResult = {
  steps: RuntimeStep[]
  values: Record<string, SignalValue>
}

export type RuntimeFrame = {
  tick: number
  totalTicks: number
  result: RuntimeResult
}

export const signalKey = (nodeId: string, portId: string) => `${nodeId}:${portId}`
