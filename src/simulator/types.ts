export type SignalType = 'number' | 'boolean' | 'number-stream' | 'boolean-stream'
export type SignalValue = number | boolean | readonly number[] | readonly boolean[]

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
  | 'number-stream-input'
  | 'boolean-stream-input'
  | 'stream-greater-than'
  | 'stream-equal'
  | 'stream-and'
  | 'count-true'
  | 'stream-length'
  | 'divide'
  | 'number-output'

export type SimulatorNode = {
  id: string
  kind: SimulatorNodeKind
  x: number
  y: number
  componentInstanceId?: string
  config?: {
    value?: number
    label?: string
    values?: boolean[]
    numberValues?: number[]
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
  components?: SimulatorComponentInstance[]
}

export type SimulatorComponentPort = {
  id: string
  label: string
  type: SignalType
  direction: PortDirection
  nodeId: string
  portId: string
}

export type SimulatorComponentDefinition = {
  id: string
  name: string
  revision?: number
  nodes: SimulatorNode[]
  wires: SimulatorWire[]
  ports: SimulatorComponentPort[]
}

export type SimulatorComponentInstance = {
  id: string
  definitionId: string
  definitionRevision?: number
  x: number
  y: number
  nodeIds: string[]
  boundaryMap: Record<string, PortAddress>
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
  nodeIndex: number
  nodeCount: number
  sampleComplete: boolean
  result: RuntimeResult
}

export type RuntimeSession = {
  tick: number
  totalTicks: number
  nodeIndex: number
  values: Record<string, SignalValue>
}

export const signalKey = (nodeId: string, portId: string) => `${nodeId}:${portId}`
