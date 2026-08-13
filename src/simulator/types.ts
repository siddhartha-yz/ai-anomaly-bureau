export type SignalType = 'number' | 'boolean'
export type SignalValue = number | boolean

export type PortDirection = 'input' | 'output'

export type PortSpec = {
  id: string
  label: string
  type: SignalType
  direction: PortDirection
}

export type SimulatorNodeKind = 'number-input' | 'constant' | 'greater-than' | 'boolean-output'

export type SimulatorNode = {
  id: string
  kind: SimulatorNodeKind
  x: number
  y: number
  config?: {
    value?: number
    label?: string
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

export const signalKey = (nodeId: string, portId: string) => `${nodeId}:${portId}`
