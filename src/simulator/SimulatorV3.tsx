import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { NODE_DEFINITIONS, SIMULATOR_PALETTE } from './catalog'
import { createBlueprint, instantiateBlueprint, parseBlueprints, type SimulatorBlueprint } from './blueprints'
import { componentBoundaryAddress, createComponentDefinition, editComponentInterface, forkComponentDefinition, instantiateComponent, moveComponentInstance, parseComponentDefinitions, removeComponentInstance, restoreComponentInstance, unpackComponentInstance, updateComponentDefinitionFromInstance } from './components'
import { canConnect, connect, createEmptyGraph, createNode, removeNode, removeWire } from './graph'
import { applyTestInputs, captureTestCase, parseTestCases, runTestSuite, simulatorTerminalName, type SimulatorTestResult } from './harness'
import { applyGraphEdit, createGraphHistory, recordGraphSnapshot, redoGraph, replaceGraphPresent, undoGraph } from './history'
import { createRuntimeSession, evaluateGraph, runtimeCursorNodeId, stepRuntimeSession, streamClockLength, visibleValuesAfterStep } from './runtime'
import { collectSignalProbeReadings, matchingSignalProbeBreak, type SignalProbeBreakCondition } from './probes'
import { moveSelectedUnits, normalizeBoardRect, selectVisibleUnitsInRect, type BoardRect } from './selection'
import { signalKey, type PortAddress, type RuntimeResult, type RuntimeSession, type SignalValue, type SimulatorComponentDefinition, type SimulatorComponentInstance, type SimulatorGraph, type SimulatorNodeKind } from './types'
import { fitViewport, panViewport, zoomViewportAtPoint, type SimulatorViewport } from './viewport'

const STORAGE_KEY = 'aia.simulator-v3.board.v1'
const BLUEPRINT_STORAGE_KEY = 'aia.simulator-v3.blueprints.v1'
const COMPONENT_STORAGE_KEY = 'aia.simulator-v3.components.v1'
const TEST_STORAGE_KEY = 'aia.simulator-v3.tests.v1'
const NODE_W = 164
const NODE_H = 104
const COMPONENT_W = 190
const COMPONENT_H = 118
const BOARD_W = 2200
const BOARD_H = 1400

const NODE_LOCALIZED_TITLES: Record<SimulatorNodeKind, string> = {
  'number-input': '数值输入',
  constant: '常量',
  'greater-than': '大于比较',
  'boolean-output': '布尔输出',
  'number-stream-input': '数值流输入',
  'boolean-stream-input': '布尔流输入',
  'stream-greater-than': '逐项大于',
  'stream-equal': '逐项相等',
  'stream-and': '逐项与',
  'count-true': '真值计数',
  'stream-length': '流长度',
  divide: '除法',
  'number-output': '数值输出',
}

const PORT_LOCALIZED_LABELS: Record<string, string> = {
  value: '值',
  stream: '数据流',
  threshold: '阈值',
  result: '结果',
  match: '匹配',
  count: '计数',
  length: '长度',
}

function localizedNodeTitle(kind: SimulatorNodeKind) {
  return NODE_LOCALIZED_TITLES[kind]
}

function localizedPortLabel(label: string) {
  return PORT_LOCALIZED_LABELS[label] ?? label
}

function localizedSignalType(type: string) {
  return ({ number: '数值', boolean: '布尔', 'number-stream': '数值流', 'boolean-stream': '布尔流' } as Record<string, string>)[type] ?? type
}

function formatValue(value: SignalValue | undefined) {
  if (value === undefined) return '—'
  if (Array.isArray(value)) return value.every((item) => typeof item === 'boolean')
    ? `[${value.map((item) => item ? 'T' : 'F').join(' ')}]`
    : `[${value.map((item) => Number(item).toFixed(2)).join(' ')}]`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return '—'
}

function parseBooleanStream(raw: string) {
  const tokens = raw.split(/[\s,;|]+/).map((token) => token.trim()).filter(Boolean)
  if (tokens.some((token) => token !== '0' && token !== '1')) return null
  return tokens.map((token) => token === '1')
}

function parseNumberStream(raw: string) {
  const tokens = raw.split(/[\s,;|]+/).map((token) => token.trim()).filter(Boolean)
  const values = tokens.map(Number)
  if (values.some((value) => !Number.isFinite(value))) return null
  return values
}

function readBlueprints(): SimulatorBlueprint[] {
  try { return parseBlueprints(window.localStorage.getItem(BLUEPRINT_STORAGE_KEY)) } catch { return [] }
}

function readComponents(): SimulatorComponentDefinition[] {
  try { return parseComponentDefinitions(window.localStorage.getItem(COMPONENT_STORAGE_KEY)) } catch { return [] }
}

function readTests() {
  try { return parseTestCases(window.localStorage.getItem(TEST_STORAGE_KEY)) } catch { return [] }
}

function readGraph(): SimulatorGraph {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyGraph()
    const parsed = JSON.parse(raw) as SimulatorGraph
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.wires)) return createEmptyGraph()
    return { ...parsed, components: Array.isArray(parsed.components) ? parsed.components : [] }
  } catch {
    return createEmptyGraph()
  }
}

function portY(nodeY: number, index: number, count: number) {
  if (count <= 1) return nodeY + NODE_H / 2
  return nodeY + 38 + index * ((NODE_H - 54) / (count - 1))
}

function componentPortY(y: number, index: number, count: number) {
  if (count <= 1) return y + COMPONENT_H / 2
  return y + 38 + index * ((COMPONENT_H - 54) / (count - 1))
}

function componentProxyPoint(graph: SimulatorGraph, definitions: readonly SimulatorComponentDefinition[], address: PortAddress, direction: 'input' | 'output') {
  for (const instance of graph.components ?? []) {
    const definition = definitions.find((item) => item.id === instance.definitionId)
    if (!definition) continue
    const ports = definition.ports.filter((port) => port.direction === direction)
    const index = ports.findIndex((port) => {
      const mapped = instance.boundaryMap[port.id]
      return mapped?.nodeId === address.nodeId && mapped.portId === address.portId
    })
    if (index < 0) continue
    return {
      x: direction === 'input' ? instance.x : instance.x + COMPONENT_W,
      y: componentPortY(instance.y, index, ports.length),
    }
  }
  return undefined
}

function wirePath(graph: SimulatorGraph, definitions: readonly SimulatorComponentDefinition[], wire: SimulatorGraph['wires'][number]) {
  const from = graph.nodes.find((node) => node.id === wire.fromNodeId)
  const to = graph.nodes.find((node) => node.id === wire.toNodeId)
  if (!from || !to) return ''
  const fromDef = NODE_DEFINITIONS[from.kind]
  const toDef = NODE_DEFINITIONS[to.kind]
  const fromIndex = fromDef.outputs.findIndex((port) => port.id === wire.fromPortId)
  const toIndex = toDef.inputs.findIndex((port) => port.id === wire.toPortId)
  const fromProxy = componentProxyPoint(graph, definitions, { nodeId: wire.fromNodeId, portId: wire.fromPortId }, 'output')
  const toProxy = componentProxyPoint(graph, definitions, { nodeId: wire.toNodeId, portId: wire.toPortId }, 'input')
  const x1 = fromProxy?.x ?? from.x + NODE_W
  const y1 = fromProxy?.y ?? portY(from.y, fromIndex, fromDef.outputs.length)
  const x2 = toProxy?.x ?? to.x
  const y2 = toProxy?.y ?? portY(to.y, toIndex, toDef.inputs.length)
  const bend = Math.max(48, Math.abs(x2 - x1) * .45)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

export function SimulatorV3() {
  const [graphHistory, setGraphHistory] = useState(() => createGraphHistory(readGraph()))
  const graph = graphHistory.present
  const [pendingPort, setPendingPort] = useState<PortAddress | null>(null)
  const [wireGesture, setWireGesture] = useState<{ from: PortAddress; x: number; y: number } | null>(null)
  const [wireGestureTarget, setWireGestureTarget] = useState<{ to: PortAddress; ok: boolean } | null>(null)
  const [runtime, setRuntime] = useState<RuntimeResult | null>(null)
  const [runtimeSession, setRuntimeSession] = useState<RuntimeSession | null>(null)
  const [stepIndex, setStepIndex] = useState(-1)
  const [clockTickIndex, setClockTickIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [playDelay, setPlayDelay] = useState(180)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [probeWireIds, setProbeWireIds] = useState<string[]>([])
  const [probeBreakConditions, setProbeBreakConditions] = useState<Record<string, SignalProbeBreakCondition>>({})
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedComponentInstanceIds, setSelectedComponentInstanceIds] = useState<string[]>([])
  const [breakpointNodeIds, setBreakpointNodeIds] = useState<string[]>([])
  const [blueprints, setBlueprints] = useState<SimulatorBlueprint[]>(() => readBlueprints())
  const [components, setComponents] = useState<SimulatorComponentDefinition[]>(() => readComponents())
  const [benchTests, setBenchTests] = useState(() => readTests())
  const [benchResults, setBenchResults] = useState<SimulatorTestResult[]>([])
  const [benchTestName, setBenchTestName] = useState('')
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null)
  const [openComponentScope, setOpenComponentScope] = useState<{ instance: SimulatorComponentInstance; name: string; definitionId: string } | null>(null)
  const [componentForkName, setComponentForkName] = useState('')
  const [blueprintName, setBlueprintName] = useState('')
  const [status, setStatus] = useState('空白板已就绪。拖入元件，自己接线。')
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number; snapshot: SimulatorGraph } | null>(null)
  const componentDragRef = useRef<{ instanceId: string; offsetX: number; offsetY: number; snapshot: SimulatorGraph } | null>(null)
  const groupDragRef = useRef<{ nodeIds: string[]; componentInstanceIds: string[]; startX: number; startY: number; snapshot: SimulatorGraph } | null>(null)
  const [selectionBox, setSelectionBox] = useState<BoardRect | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<SimulatorViewport>({ zoom: .75, panX: 18, panY: 18 })
  const viewportPanRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const spacePanRef = useRef(false)
  const suppressPortClickRef = useRef(false)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)) } catch { /* persistence is optional */ }
  }, [graph])
  useEffect(() => {
    try { window.localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(blueprints)) } catch { /* persistence is optional */ }
  }, [blueprints])
  useEffect(() => {
    try { window.localStorage.setItem(COMPONENT_STORAGE_KEY, JSON.stringify(components)) } catch { /* persistence is optional */ }
  }, [components])
  useEffect(() => {
    try { window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(benchTests)) } catch { /* persistence is optional */ }
  }, [benchTests])
  useEffect(() => {
    const liveWireIds = new Set(graph.wires.map((wire) => wire.id))
    setProbeWireIds((current) => current.filter((wireId) => liveWireIds.has(wireId)))
    setProbeBreakConditions((current) => Object.fromEntries(Object.entries(current).filter(([wireId]) => liveWireIds.has(wireId))))
  }, [graph.wires])

  const visibleValues = useMemo(() => runtime && stepIndex >= 0 ? visibleValuesAfterStep(runtime, stepIndex) : {}, [runtime, stepIndex])
  const probeReadings = useMemo(() => collectSignalProbeReadings(graph, probeWireIds, visibleValues), [graph, probeWireIds, visibleValues])

  const probeSignalType = useCallback((wireId: string) => {
    const wire = graph.wires.find((item) => item.id === wireId)
    const node = wire ? graph.nodes.find((item) => item.id === wire.fromNodeId) : undefined
    const port = node && wire ? NODE_DEFINITIONS[node.kind].outputs.find((item) => item.id === wire.fromPortId) : undefined
    return port?.type
  }, [graph])

  const probeBreakLabel = useCallback((condition: SignalProbeBreakCondition | undefined) => {
    if (!condition) return 'BREAK OFF'
    if (condition.mode === 'boolean') return `BREAK ${condition.value ? 'TRUE' : 'FALSE'}`
    return `BREAK ${condition.mode === 'number-at-least' ? '≥' : '≤'} ${condition.threshold}`
  }, [])
  const editGraph = useCallback((updater: (current: SimulatorGraph) => SimulatorGraph) => {
    setGraphHistory((history) => applyGraphEdit(history, updater(history.present)))
  }, [])
  const replaceGraph = useCallback((updater: (current: SimulatorGraph) => SimulatorGraph) => {
    setGraphHistory((history) => replaceGraphPresent(history, updater(history.present)))
  }, [])
  const nextNodeId = (kind: SimulatorNodeKind) => {
    const prefix = kind.replaceAll('-', '_')
    let index = 1
    while (graph.nodes.some((node) => node.id === `${prefix}_${index}`)) index += 1
    return `${prefix}_${index}`
  }
  const clearRuntime = useCallback(() => {
    setRuntime(null)
    setRuntimeSession(null)
    setStepIndex(-1)
    setClockTickIndex(-1)
    setPlaying(false)
  }, [])

  const addNode = (kind: SimulatorNodeKind, x?: number, y?: number) => {
    const id = nextNodeId(kind)
    const sameKindCount = graph.nodes.filter((node) => node.kind === kind).length
    const defaults: Record<SimulatorNodeKind, { x: number; y: number }> = {
      'number-input': { x: 70, y: 110 },
      constant: { x: 70, y: 300 },
      'greater-than': { x: 450, y: 205 },
      'boolean-output': { x: 820, y: 205 },
      'number-stream-input': { x: 60, y: 80 },
      'boolean-stream-input': { x: 60, y: 220 },
      'stream-greater-than': { x: 310, y: 80 },
      'stream-equal': { x: 310, y: 220 },
      'stream-and': { x: 310, y: 300 },
      'count-true': { x: 540, y: 90 },
      'stream-length': { x: 540, y: 300 },
      divide: { x: 770, y: 190 },
      'number-output': { x: 950, y: 190 },
    }
    const fallback = defaults[kind]
    const staggerX = sameKindCount * 18
    const staggerY = sameKindCount * 132
    editGraph((current) => ({ ...current, nodes: [...current.nodes, createNode(kind, id, Math.min(BOARD_W - NODE_W - 18, x ?? fallback.x + staggerX), Math.min(BOARD_H - NODE_H - 18, y ?? fallback.y + staggerY))] }))
    clearRuntime()
    setStatus(`${localizedNodeTitle(kind)} 已放入构造台。`)
  }

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds((current) => current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId])
    setSelectedWireId(null)
  }

  const toggleComponentSelection = (instanceId: string) => {
    setSelectedComponentInstanceIds((current) => current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId])
    setSelectedWireId(null)
  }

  const componentSelectionNodeIds = () => {
    const selected = new Set(selectedNodeIds)
    for (const instanceId of selectedComponentInstanceIds) {
      const instance = (graph.components ?? []).find((item) => item.id === instanceId)
      for (const nodeId of instance?.nodeIds ?? []) selected.add(nodeId)
    }
    return [...selected]
  }

  const saveBlueprint = () => {
    try {
      const id = `bp_${Date.now()}`
      const blueprint = createBlueprint(graph, selectedNodeIds, id, blueprintName)
      setBlueprints((current) => [...current, blueprint])
      setSelectedNodeIds([])
      setBlueprintName('')
      setStatus(`蓝图已保存 · ${blueprint.name} · ${blueprint.nodes.length} 个节点`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '蓝图保存失败。')
    }
  }

  const saveComponent = () => {
    try {
      const id = `component_${Date.now()}`
      const definition = createComponentDefinition(graph, componentSelectionNodeIds(), id, blueprintName)
      setComponents((current) => [...current, definition])
      setSelectedNodeIds([])
      setSelectedComponentInstanceIds([])
      setBlueprintName('')
      const inputCount = definition.ports.filter((port) => port.direction === 'input').length
      const outputCount = definition.ports.filter((port) => port.direction === 'output').length
      setStatus(`组件已封装 · ${definition.name} · ${inputCount} 入 / ${outputCount} 出`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '组件封装失败。')
    }
  }

  const updateComponentInterface = (
    definitionId: string,
    update: { name?: string; portLabels?: Readonly<Record<string, string>> },
  ) => {
    setComponents((current) => current.map((definition) => definition.id === definitionId
      ? editComponentInterface(definition, update)
      : definition))
    setStatus('组件接口已更新 · 已有实例的接线保持不变。')
  }

  const placeBlueprint = (blueprint: SimulatorBlueprint) => {
    editGraph((current) => {
      const width = Math.max(...blueprint.nodes.map((node) => node.x)) + NODE_W
      const height = Math.max(...blueprint.nodes.map((node) => node.y)) + NODE_H
      const candidates: { x: number; y: number }[] = []
      for (let y = 24; y <= BOARD_H - height - 12; y += 132) {
        for (let x = 24; x <= BOARD_W - width - 12; x += 190) candidates.push({ x, y })
      }
      const origin = candidates.find((candidate) => blueprint.nodes.every((blueprintNode) => {
        const x = candidate.x + blueprintNode.x
        const y = candidate.y + blueprintNode.y
        return current.nodes.every((node) => x + NODE_W + 12 <= node.x || node.x + NODE_W + 12 <= x || y + NODE_H + 12 <= node.y || node.y + NODE_H + 12 <= y)
      })) ?? { x: 24, y: 24 }
      return instantiateBlueprint(current, blueprint, origin)
    })
    setSelectedNodeIds([])
    setSelectedComponentInstanceIds([])
    clearRuntime()
    setStatus(`蓝图已放置 · ${blueprint.name}`)
  }

  const placeComponent = (definition: SimulatorComponentDefinition) => {
    editGraph((current) => {
      const occupied = [
        ...current.nodes.filter((node) => !node.componentInstanceId).map((node) => ({ x: node.x, y: node.y, w: NODE_W, h: NODE_H })),
        ...(current.components ?? []).map((instance) => ({ x: instance.x, y: instance.y, w: COMPONENT_W, h: COMPONENT_H })),
      ]
      const candidates: { x: number; y: number }[] = []
      for (let y = 24; y <= BOARD_H - COMPONENT_H - 12; y += 138) {
        for (let x = 24; x <= BOARD_W - COMPONENT_W - 12; x += 210) candidates.push({ x, y })
      }
      const origin = candidates.find((candidate) => occupied.every((item) => candidate.x + COMPONENT_W + 12 <= item.x || item.x + item.w + 12 <= candidate.x || candidate.y + COMPONENT_H + 12 <= item.y || item.y + item.h + 12 <= candidate.y)) ?? { x: 24, y: 24 }
      return instantiateComponent(current, definition, origin)
    })
    setSelectedNodeIds([])
    setSelectedComponentInstanceIds([])
    clearRuntime()
    setStatus(`组件已放置 · ${definition.name}`)
  }

  const openComponent = (instance: SimulatorComponentInstance, definition: SimulatorComponentDefinition) => {
    if (openComponentScope) {
      setStatus(`先关闭当前黑盒 ${openComponentScope.name}，再进入另一个组件。`)
      return
    }
    const scopeInstance: SimulatorComponentInstance = {
      ...instance,
      nodeIds: [...instance.nodeIds],
      boundaryMap: Object.fromEntries(Object.entries(instance.boundaryMap).map(([portId, address]) => [portId, { ...address }])),
    }
    editGraph((current) => unpackComponentInstance(current, instance.id))
    setOpenComponentScope({ instance: scopeInstance, name: definition.name, definitionId: definition.id })
    setComponentForkName(`${definition.name} 分支`)
    setSelectedComponentInstanceIds((current) => current.filter((id) => id !== instance.id))
    setSelectedNodeIds([])
    setSelectedWireId(null)
    clearRuntime()
    setStatus(`进入组件 · ${definition.name} · 当前显示这个实例的内部元件；完成后可收回黑盒。`)
  }

  const forkOpenComponent = () => {
    if (!openComponentScope) return
    const source = components.find((item) => item.id === openComponentScope.definitionId)
    if (!source) {
      setStatus('无法分叉组件：原组件定义已经不存在。')
      return
    }
    try {
      const definition = forkComponentDefinition(
        graph,
        openComponentScope.instance,
        source,
        `component_${Date.now()}`,
        componentForkName,
      )
      setComponents((current) => [...current, definition])
      setComponentForkName(`${definition.name} 分支`)
      setStatus(`组件分支已保存 · ${definition.name} · 当前实例继续保持打开。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '组件分叉失败。')
    }
  }

  const updateOpenComponentDefinition = () => {
    if (!openComponentScope) return
    const source = components.find((item) => item.id === openComponentScope.definitionId)
    if (!source) {
      setStatus('无法更新组件：原组件定义已经不存在。')
      return
    }
    try {
      const definition = updateComponentDefinitionFromInstance(graph, openComponentScope.instance, source)
      setComponents((current) => current.map((item) => item.id === definition.id ? definition : item))
      setOpenComponentScope((current) => current ? {
        ...current,
        instance: { ...current.instance, definitionRevision: definition.revision ?? 1 },
      } : current)
      setStatus(`组件库已更新 · ${definition.name} v${definition.revision ?? 1} · 当前实例已切到新版；其他实例继续固定旧实现。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '组件定义更新失败。')
    }
  }

  const closeComponent = () => {
    if (!openComponentScope) return
    try {
      const restored = restoreComponentInstance(graph, openComponentScope.instance)
      setGraphHistory((history) => applyGraphEdit(history, restored))
      setOpenComponentScope(null)
      setComponentForkName('')
      setSelectedNodeIds([])
      setSelectedWireId(null)
      clearRuntime()
      setStatus(`退出组件 · ${openComponentScope.name} · 修改后的实例已收回原黑盒，外部接线保持不变。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法关闭当前黑盒。')
    }
  }

  const handlePaletteDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/x-aia-node') as SimulatorNodeKind
    if (!SIMULATOR_PALETTE.includes(kind)) return
    const rect = event.currentTarget.getBoundingClientRect()
    addNode(kind, (event.clientX - rect.left) * (BOARD_W / rect.width) - NODE_W / 2, (event.clientY - rect.top) * (BOARD_H / rect.height) - NODE_H / 2)
  }

  const connectPorts = (from: PortAddress, to: PortAddress) => {
    const check = canConnect(graph, from, to)
    if (!check.ok) { setStatus(check.reason); return false }
    const wireId = `wire_${Date.now()}_${graph.wires.length + 1}`
    editGraph((current) => connect(current, { id: wireId, fromNodeId: from.nodeId, fromPortId: from.portId, toNodeId: to.nodeId, toPortId: to.portId }))
    setPendingPort(null); setSelectedWireId(null); clearRuntime(); setStatus('连线完成。')
    return true
  }

  const choosePort = (address: PortAddress, direction: 'input' | 'output') => {
    if (!pendingPort) {
      if (direction !== 'output') { setStatus('从输出端口开始拉线，或直接把输出端口拖到这里。'); return }
      setPendingPort(address); setStatus('输出端口已抓住；选择一个兼容输入端口。'); return
    }
    if (direction === 'output') { setPendingPort(address); setStatus('已改选另一个输出端口。'); return }
    connectPorts(pendingPort, address)
  }

  const dropWire = (event: DragEvent<HTMLButtonElement>, to: PortAddress) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/x-aia-port')
    const [nodeId, portId] = raw.split('::')
    if (!nodeId || !portId) return
    connectPorts({ nodeId, portId }, to)
  }

  const beginWireGesture = (event: ReactPointerEvent<HTMLButtonElement>, from: PortAddress) => {
    if (event.button !== 0 || spacePanRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (BOARD_W / rect.width)
    const y = (event.clientY - rect.top) * (BOARD_H / rect.height)
    setWireGesture({ from, x, y })
    setWireGestureTarget(null)
    setPendingPort(from)
    setSelectedWireId(null)
    suppressPortClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setStatus('正在拉线；松开到兼容输入端口即可连接。')
  }

  const runtimeNodeDisplayName = useCallback((nodeId: string) => {
    const node = graph.nodes.find((item) => item.id === nodeId)
    if (!node) return nodeId
    if (node.componentInstanceId) {
      const instance = (graph.components ?? []).find((item) => item.id === node.componentInstanceId)
      const definition = instance ? components.find((item) => item.id === instance.definitionId) : undefined
      return definition ? `组件 · ${definition.name}` : '自制组件'
    }
    return `${localizedNodeTitle(node.kind)} · ${NODE_DEFINITIONS[node.kind].title}`
  }, [components, graph])

  const advanceStep = useCallback((fromPlayback = false) => {
    try {
      const clockLength = streamClockLength(graph)
      if (clockLength > 0) {
        const session = runtimeSession ?? createRuntimeSession(graph)
        const cursorNodeId = runtimeCursorNodeId(graph, session)
        if (fromPlayback && cursorNodeId && breakpointNodeIds.includes(cursorNodeId)) {
          setPlaying(false)
          setStatus(`BREAKPOINT · ${cursorNodeId} · STEP 可执行当前节点，或取消断点后继续 PLAY。`)
          return false
        }
        if (session.tick >= session.totalTicks) {
          if (fromPlayback) setPlaying(false)
          setStatus('所有样本时钟已经执行完毕。RESET SIGNAL 后可重新运行。')
          return true
        }
        const stepped = stepRuntimeSession(graph, session)
        const frame = stepped.frame
        const previousSteps = runtime?.steps ?? []
        const currentStep = frame.result.steps[0]
        const sampleStart = session.nodeIndex === 0
        const steps = sampleStart ? [currentStep] : [...previousSteps, currentStep]
        setRuntime({ steps, values: frame.result.values })
        setStepIndex(steps.length - 1)
        setRuntimeSession(stepped.session)
        setClockTickIndex(stepped.session.tick - 1)
        const node = graph.nodes.find((item) => item.id === currentStep.nodeId)
        const complete = stepped.session.tick >= stepped.session.totalTicks && stepped.session.nodeIndex === 0
        const probeBreak = fromPlayback
          ? matchingSignalProbeBreak(graph, probeBreakConditions, frame.result.values, currentStep.nodeId)
          : undefined
        if (probeBreak) {
          setPlaying(false)
          const probeIndex = probeWireIds.indexOf(probeBreak.wireId) + 1
          setStatus(`PROBE BREAK · P${probeIndex || '?'} · ${probeBreak.from} = ${formatValue(probeBreak.latest)} · STEP 可继续检查下游。`)
          return false
        }
        if (complete && fromPlayback) setPlaying(false)
        setStatus(complete
          ? fromPlayback
            ? `PLAY COMPLETE · ${frame.totalTicks} 个样本时钟已执行。`
            : `SAMPLE ${frame.tick}/${frame.totalTicks} · NODE ${frame.nodeIndex + 1}/${frame.nodeCount}${node ? ` · ${runtimeNodeDisplayName(node.id)}` : ''} · SAMPLE COMPLETE · ALL SAMPLES COMPLETE`
          : `SAMPLE ${frame.tick}/${frame.totalTicks} · NODE ${frame.nodeIndex + 1}/${frame.nodeCount}${node ? ` · ${runtimeNodeDisplayName(node.id)}` : ''}${frame.sampleComplete ? ' · SAMPLE COMPLETE' : ''}`)
        return complete
      }
      const result = runtime ?? evaluateGraph(graph)
      if (!result.steps.length) {
        if (fromPlayback) setPlaying(false)
        setStatus('当前输出电路没有可执行节点。')
        return true
      }
      if (stepIndex >= result.steps.length - 1) {
        if (fromPlayback) setPlaying(false)
        setStatus('所有节点已经执行完毕。RESET SIGNAL 后可重新运行。')
        return true
      }
      const next = Math.min(result.steps.length - 1, stepIndex + 1)
      const cursorNodeId = result.steps[next]?.nodeId
      if (fromPlayback && cursorNodeId && breakpointNodeIds.includes(cursorNodeId)) {
        setPlaying(false)
        setStatus(`BREAKPOINT · ${cursorNodeId} · STEP 可执行当前节点，或取消断点后继续 PLAY。`)
        return false
      }
      setRuntime(result); setStepIndex(next)
      const node = graph.nodes.find((item) => item.id === result.steps[next]?.nodeId)
      const complete = next === result.steps.length - 1
      const probeBreak = fromPlayback && cursorNodeId
        ? matchingSignalProbeBreak(graph, probeBreakConditions, visibleValuesAfterStep(result, next), cursorNodeId)
        : undefined
      if (probeBreak) {
        setPlaying(false)
        const probeIndex = probeWireIds.indexOf(probeBreak.wireId) + 1
        setStatus(`PROBE BREAK · P${probeIndex || '?'} · ${probeBreak.from} = ${formatValue(probeBreak.latest)} · STEP 可继续检查下游。`)
        return false
      }
      if (complete && fromPlayback) setPlaying(false)
      setStatus(complete
        ? fromPlayback
          ? `PLAY COMPLETE · ${result.steps.length} 个节点已求值。`
          : node ? `NODE ${next + 1}/${result.steps.length} · ${runtimeNodeDisplayName(node.id)} · COMPLETE` : 'COMPLETE'
        : node ? `NODE ${next + 1}/${result.steps.length} · ${runtimeNodeDisplayName(node.id)}` : '没有更多步骤。')
      return complete
    } catch (error) {
      clearRuntime()
      setStatus(error instanceof Error ? error.message : '单步执行失败。')
      return true
    }
  }, [breakpointNodeIds, clearRuntime, graph, probeBreakConditions, probeWireIds, runtime, runtimeNodeDisplayName, runtimeSession, stepIndex])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => advanceStep(true), playDelay)
    return () => window.clearTimeout(timer)
  }, [advanceStep, playDelay, playing])

  const play = () => {
    try {
      const clockLength = streamClockLength(graph)
      if (clockLength > 0) {
        const session = runtimeSession ?? createRuntimeSession(graph)
        if (session.tick >= session.totalTicks) clearRuntime()
      } else {
        const result = runtime ?? evaluateGraph(graph)
        if (result.steps.length && stepIndex >= result.steps.length - 1) clearRuntime()
      }
      setPlaying(true)
      setStatus('运行中 · PLAYING · 每个时钟只推进一个节点，可随时暂停。')
    } catch (error) {
      clearRuntime()
      setStatus(error instanceof Error ? error.message : '运行失败。')
    }
  }

  const pause = () => {
    setPlaying(false)
    setStatus('已暂停 · PAUSED · 当前信号状态已冻结，可检查连线或继续单步。')
  }

  const step = () => {
    if (playing) setPlaying(false)
    advanceStep(false)
  }

  const resetTransientBoardState = useCallback(() => {
    setPendingPort(null)
    setSelectedWireId(null)
    setSelectedNodeIds([])
    setSelectedComponentInstanceIds([])
    setOpenComponentScope(null)
    clearRuntime()
  }, [clearRuntime])

  const undo = useCallback(() => {
    if (!graphHistory.past.length) return
    setGraphHistory((history) => undoGraph(history))
    resetTransientBoardState()
    setStatus('已撤销 · UNDO · 恢复上一步构造状态。')
  }, [graphHistory.past.length, resetTransientBoardState])

  const redo = useCallback(() => {
    if (!graphHistory.future.length) return
    setGraphHistory((history) => redoGraph(history))
    resetTransientBoardState()
    setStatus('已重做 · REDO · 重新应用下一步构造状态。')
  }, [graphHistory.future.length, resetTransientBoardState])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNodeIds.length || selectedComponentInstanceIds.length)) {
        event.preventDefault()
        const selectedComponents = new Set(selectedComponentInstanceIds)
        const selectedNodes = new Set(selectedNodeIds)
        editGraph((current) => {
          let next = current
          for (const instance of current.components ?? []) if (selectedComponents.has(instance.id)) next = removeComponentInstance(next, instance.id)
          for (const nodeId of selectedNodes) next = removeNode(next, nodeId)
          return next
        })
        setSelectedNodeIds([])
        setSelectedComponentInstanceIds([])
        setBreakpointNodeIds((current) => current.filter((id) => !selectedNodes.has(id)))
        clearRuntime()
        setStatus('已删除所选 · DELETE SELECTION · 选中的构造单元已移除。')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearRuntime, editGraph, redo, selectedComponentInstanceIds, selectedNodeIds, undo])

  const updateNumber = (nodeId: string, value: number) => {
    editGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, value } } : node) }))
    clearRuntime()
  }

  const updateNumberStream = (nodeId: string, raw: string) => {
    const numberValues = parseNumberStream(raw)
    if (!numberValues) { setStatus('NUMBER STREAM 只接受有限数字，以逗号或空格分隔。'); return }
    editGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, numberValues } } : node) }))
    clearRuntime()
  }

  const updateBooleanStream = (nodeId: string, raw: string) => {
    const values = parseBooleanStream(raw)
    if (!values) { setStatus('BOOLEAN STREAM 只接受 1 / 0，以逗号或空格分隔。'); return }
    editGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, values } } : node) }))
    clearRuntime()
  }

  const updateTerminalLabel = (nodeId: string, label: string) => {
    editGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, label } } : node),
    }))
    setBenchResults([])
    setStatus(`I/O 端口已重命名 · ${label.trim() || nodeId}`)
  }

  const captureBenchTest = () => {
    try {
      const test = captureTestCase(graph, `test_${Date.now()}`, benchTestName)
      setBenchTests((current) => [...current, test])
      setBenchResults([])
      setBenchTestName('')
      setStatus(`测试样例已记录 · ${test.name} · ${test.inputs.length} 输入 / ${test.expected.length} 输出`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '测试快照保存失败。')
    }
  }

  const runBenchTests = () => {
    if (!benchTests.length) return
    const results = runTestSuite(graph, benchTests)
    setBenchResults(results)
    const passed = results.filter((result) => result.passed).length
    setStatus(`测试套件 · ${passed}/${results.length} 通过${passed === results.length ? ' · 无回归' : ' · 行为已变化'}`)
  }

  const loadBenchInputs = (testId: string) => {
    const test = benchTests.find((item) => item.id === testId)
    if (!test) return
    try {
      editGraph((current) => applyTestInputs(current, test))
      clearRuntime()
      setStatus(`测试输入已载入 · ${test.name} · 预期输出仍保持冻结。`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '测试输入恢复失败。')
    }
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.code === 'Space' && !target?.closest('input, textarea, select')) {
        spacePanRef.current = true
        event.preventDefault()
      }
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePanRef.current = false
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', keyUp as EventListener)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', keyUp as EventListener)
    }
  }, [])

  const fitBoardViewport = useCallback(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) return
    const rect = viewportElement.getBoundingClientRect()
    setViewport(fitViewport(rect.width, rect.height, BOARD_W, BOARD_H))
    setStatus('适配全局 · VIEW FIT · 整张构造台已缩放到当前视野。')
  }, [])

  const resetBoardViewport = useCallback(() => {
    setViewport({ zoom: .75, panX: 18, panY: 18 })
    setStatus('视角复位 · VIEW RESET · 返回默认工作区视角。')
  }, [])

  const zoomBoardViewport = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 1) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const factor = Math.exp(-event.deltaY * .0012)
    setViewport((current) => zoomViewportAtPoint(current, current.zoom * factor, pointerX, pointerY))
  }

  const startViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wantsPan = event.button === 1 || (event.button === 0 && spacePanRef.current)
    if (!wantsPan) return
    event.preventDefault()
    event.stopPropagation()
    viewportPanRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setStatus('正在平移 · 松开鼠标结束；滚轮围绕指针缩放。')
  }

  const moveViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = viewportPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - pan.x
    const dy = event.clientY - pan.y
    viewportPanRef.current = { ...pan, x: event.clientX, y: event.clientY }
    setViewport((current) => panViewport(current, dx, dy))
  }

  const finishViewportPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = viewportPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    viewportPanRef.current = null
    setStatus(`VIEW · ${Math.round(viewport.zoom * 100)}% · Space+拖动或中键可继续平移。`)
  }

  const startMove = (event: ReactPointerEvent<HTMLDivElement>, nodeId: string) => {
    if ((event.target as HTMLElement).closest('button, input')) return
    if (event.button !== 0 || spacePanRef.current) return
    event.stopPropagation()
    const node = graph.nodes.find((item) => item.id === nodeId)
    const board = boardRef.current
    if (!node || !board) return
    const rect = board.getBoundingClientRect()
    const boardX = (event.clientX - rect.left) * (BOARD_W / rect.width)
    const boardY = (event.clientY - rect.top) * (BOARD_H / rect.height)
    if (selectedNodeIds.includes(nodeId) && selectedNodeIds.length + selectedComponentInstanceIds.length > 1) {
      groupDragRef.current = { nodeIds: [...selectedNodeIds], componentInstanceIds: [...selectedComponentInstanceIds], startX: boardX, startY: boardY, snapshot: graph }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    dragRef.current = { nodeId, offsetX: boardX - node.x, offsetY: boardY - node.y, snapshot: graph }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveNode = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const board = boardRef.current
    if (!drag || !board) return
    const rect = board.getBoundingClientRect()
    const x = Math.max(8, Math.min(BOARD_W - NODE_W - 8, (event.clientX - rect.left) * (BOARD_W / rect.width) - drag.offsetX))
    const y = Math.max(8, Math.min(BOARD_H - NODE_H - 8, (event.clientY - rect.top) * (BOARD_H / rect.height) - drag.offsetY))
    replaceGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === drag.nodeId ? { ...node, x, y } : node) }))
  }

  const startComponentMove = (event: ReactPointerEvent<HTMLDivElement>, instanceId: string) => {
    if ((event.target as HTMLElement).closest('button')) return
    if (event.button !== 0 || spacePanRef.current) return
    event.stopPropagation()
    const instance = (graph.components ?? []).find((item) => item.id === instanceId)
    const board = boardRef.current
    if (!instance || !board) return
    const rect = board.getBoundingClientRect()
    const boardX = (event.clientX - rect.left) * (BOARD_W / rect.width)
    const boardY = (event.clientY - rect.top) * (BOARD_H / rect.height)
    if (selectedComponentInstanceIds.includes(instanceId) && selectedNodeIds.length + selectedComponentInstanceIds.length > 1) {
      groupDragRef.current = { nodeIds: [...selectedNodeIds], componentInstanceIds: [...selectedComponentInstanceIds], startX: boardX, startY: boardY, snapshot: graph }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    componentDragRef.current = { instanceId, offsetX: boardX - instance.x, offsetY: boardY - instance.y, snapshot: graph }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveComponent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = componentDragRef.current
    const board = boardRef.current
    if (!drag || !board) return
    const rect = board.getBoundingClientRect()
    const x = Math.max(8, Math.min(BOARD_W - COMPONENT_W - 8, (event.clientX - rect.left) * (BOARD_W / rect.width) - drag.offsetX))
    const y = Math.max(8, Math.min(BOARD_H - COMPONENT_H - 8, (event.clientY - rect.top) * (BOARD_H / rect.height) - drag.offsetY))
    replaceGraph((current) => moveComponentInstance(current, drag.instanceId, x, y))
  }

  const moveBoardObjects = (event: ReactPointerEvent<HTMLDivElement>) => {
    const board = boardRef.current
    if (wireGesture && board) {
      const rect = board.getBoundingClientRect()
      const x = (event.clientX - rect.left) * (BOARD_W / rect.width)
      const y = (event.clientY - rect.top) * (BOARD_H / rect.height)
      if (Math.hypot(x - wireGesture.x, y - wireGesture.y) > 4) suppressPortClickRef.current = true
      setWireGesture((current) => current ? { ...current, x, y } : null)
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('button[data-sim-input-node][data-sim-input-port]')
      const nodeId = target?.dataset.simInputNode
      const portId = target?.dataset.simInputPort
      if (nodeId && portId) {
        const to = { nodeId, portId }
        setWireGestureTarget({ to, ok: canConnect(graph, wireGesture.from, to).ok })
      } else {
        setWireGestureTarget(null)
      }
      return
    }
    const group = groupDragRef.current
    if (group && board) {
      const rect = board.getBoundingClientRect()
      const boardX = (event.clientX - rect.left) * (BOARD_W / rect.width)
      const boardY = (event.clientY - rect.top) * (BOARD_H / rect.height)
      const visibleNodes = group.snapshot.nodes.filter((node) => group.nodeIds.includes(node.id) && !node.componentInstanceId)
      const visibleComponents = (group.snapshot.components ?? []).filter((component) => group.componentInstanceIds.includes(component.id))
      const minX = Math.min(...visibleNodes.map((node) => node.x), ...visibleComponents.map((component) => component.x))
      const minY = Math.min(...visibleNodes.map((node) => node.y), ...visibleComponents.map((component) => component.y))
      const maxX = Math.max(...visibleNodes.map((node) => node.x + NODE_W), ...visibleComponents.map((component) => component.x + COMPONENT_W))
      const maxY = Math.max(...visibleNodes.map((node) => node.y + NODE_H), ...visibleComponents.map((component) => component.y + COMPONENT_H))
      const dx = Math.max(8 - minX, Math.min(BOARD_W - 8 - maxX, boardX - group.startX))
      const dy = Math.max(8 - minY, Math.min(BOARD_H - 8 - maxY, boardY - group.startY))
      replaceGraph(() => moveSelectedUnits(group.snapshot, group.nodeIds, group.componentInstanceIds, dx, dy))
      return
    }
    moveNode(event)
    moveComponent(event)
    if (selectionBox && board) {
      const rect = board.getBoundingClientRect()
      setSelectionBox((current) => current ? { ...current, x2: (event.clientX - rect.left) * (BOARD_W / rect.width), y2: (event.clientY - rect.top) * (BOARD_H / rect.height) } : null)
    }
  }

  const finishBoardMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (wireGesture) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('button[data-sim-input-node][data-sim-input-port]')
      const nodeId = target?.dataset.simInputNode
      const portId = target?.dataset.simInputPort
      if (nodeId && portId) {
        connectPorts(wireGesture.from, { nodeId, portId })
      } else {
        setPendingPort(null)
        setStatus('连线取消：请把线松开在兼容输入端口上。')
      }
      setWireGesture(null)
      setWireGestureTarget(null)
      window.setTimeout(() => { suppressPortClickRef.current = false }, 0)
      return
    }
    const snapshot = dragRef.current?.snapshot ?? componentDragRef.current?.snapshot ?? groupDragRef.current?.snapshot
    if (snapshot) setGraphHistory((history) => recordGraphSnapshot(history, snapshot))
    dragRef.current = null
    componentDragRef.current = null
    groupDragRef.current = null
    if (selectionBox) {
      const selected = selectVisibleUnitsInRect(graph, selectionBox, { width: NODE_W, height: NODE_H }, { width: COMPONENT_W, height: COMPONENT_H })
      setSelectedNodeIds(selected.nodeIds)
      setSelectedComponentInstanceIds(selected.componentInstanceIds)
      setSelectedWireId(null)
      setSelectionBox(null)
      setStatus(`框选完成 · 已选择 ${selected.nodeIds.length + selected.componentInstanceIds.length} 个单元`)
    }
  }

  const startBoardSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || spacePanRef.current) return
    if (event.target !== event.currentTarget) return
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (BOARD_W / rect.width)
    const y = (event.clientY - rect.top) * (BOARD_H / rect.height)
    setSelectionBox({ x1: x, y1: y, x2: x, y2: y })
    setSelectedNodeIds([])
    setSelectedComponentInstanceIds([])
    setSelectedWireId(null)
    setPendingPort(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const componentOwner = new Map<string, string>()
  for (const instance of graph.components ?? []) for (const nodeId of instance.nodeIds) componentOwner.set(nodeId, instance.id)
  const visibleWires = graph.wires.filter((wire) => {
    const fromOwner = componentOwner.get(wire.fromNodeId)
    const toOwner = componentOwner.get(wire.toNodeId)
    return !fromOwner || !toOwner || fromOwner !== toOwner
  })
  const visibleUnitCount = graph.nodes.filter((node) => !node.componentInstanceId).length + (graph.components ?? []).length
  const selectedTerminalNode = selectedNodeIds.length === 1
    ? graph.nodes.find((node) => node.id === selectedNodeIds[0] && (
      node.kind === 'number-input'
      || node.kind === 'number-stream-input'
      || node.kind === 'boolean-stream-input'
      || node.kind === 'boolean-output'
      || node.kind === 'number-output'
    ))
    : undefined
  const traceRows: { key: string; label: string; value: string; stepIndex: number }[] = []
  if (runtime) {
    runtime.steps.forEach((stepItem, index) => {
      const node = graph.nodes.find((item) => item.id === stepItem.nodeId)
      const ownerId = node?.componentInstanceId
      if (ownerId) {
        const previous = traceRows.at(-1)
        if (previous?.key === ownerId) {
          previous.stepIndex = index
          return
        }
        const instance = (graph.components ?? []).find((item) => item.id === ownerId)
        const definition = instance ? components.find((item) => item.id === instance.definitionId) : undefined
        traceRows.push({ key: ownerId, label: definition?.name ?? '自制组件', value: '内部隐藏', stepIndex: index })
        return
      }
      traceRows.push({ key: stepItem.nodeId, label: stepItem.nodeId, value: Object.values(stepItem.outputs).map(formatValue).join(', '), stepIndex: index })
    })
  }

  return <main className="sim-v3-shell" aria-label="AI系统模拟器 V3">
    <header className="sim-v3-header"><div><b>异常局 / 工坊</b><span><strong>系统构造实验室</strong><small>自由构造 · 信号调试 · 组件封装</small></span></div><div className="sim-v3-header-actions"><span className="sim-mode-badge">实验模式</span><button type="button" onClick={() => { window.location.href = '?v2=1' }}>V2 原型</button><button type="button" onClick={() => { window.location.href = '?legacy=1' }}>旧版</button></div></header>
    <div className="sim-v3-layout">
      <aside className="sim-palette" aria-label="元件库"><div className="sim-panel-title"><small>基础元件 · PRIMITIVES</small><strong>元件库</strong></div>
        {SIMULATOR_PALETTE.map((kind) => { const definition = NODE_DEFINITIONS[kind]; return <button type="button" key={kind} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-aia-node', kind)} onClick={() => addNode(kind)} className="sim-palette-item" aria-label={`添加 ${definition.title} / ${localizedNodeTitle(kind)}`}><b>{definition.short}</b><span><strong>{localizedNodeTitle(kind)}</strong><small>{(definition.outputs.length ? definition.outputs : definition.inputs).map((port) => localizedSignalType(port.type)).join(' · ')}</small></span></button> })}
        {blueprints.length > 0 && <div className="sim-blueprint-list" aria-label="我的蓝图"><small>我的蓝图 · BLUEPRINTS</small>{blueprints.map((blueprint) => <button type="button" key={blueprint.id} onClick={() => placeBlueprint(blueprint)}><b>BP</b><span><strong>{blueprint.name}</strong><small>{blueprint.nodes.length} 节点 · {blueprint.wires.length} 连线</small></span></button>)}</div>}
        {components.length > 0 && <div className="sim-component-list" aria-label="我的组件"><small>我的组件 · COMPONENTS</small>{components.map((definition) => <div className="sim-component-library-row" key={definition.id}><button type="button" onClick={() => placeComponent(definition)} aria-label={`放置组件 ${definition.name}`}><b>IC</b><span><strong>{definition.name}</strong><small>v{definition.revision ?? 1} · {definition.ports.filter((port) => port.direction === 'input').length} 入 · {definition.ports.filter((port) => port.direction === 'output').length} 出</small></span></button><button type="button" className="sim-component-library-edit" aria-label={`编辑组件接口 ${definition.name}`} onClick={() => setEditingComponentId(definition.id)}>接口</button></div>)}</div>}
        <div className="sim-palette-note"><small>自由实验</small><p>标量可以搭阈值机；数据流可以逐样本过阈值，再接布尔流元件自己拼指标。蓝图复制结构；组件把自己造的结构封成带类型接口的黑盒。这里不会直接给你 Accuracy / Recall 成品节点。</p></div>
      </aside>
      <section className="sim-board-wrap" aria-label="构造画布">
        <div className="sim-toolbar"><div><small>构造台 · BOARD</small><strong>{visibleUnitCount} 元件 · {visibleWires.length} 连线{streamClockLength(graph) ? ` · 时钟 ${clockTickIndex + 1}/${streamClockLength(graph)}` : ''}{playing ? ' · 运行中' : ''} · 视图 {Math.round(viewport.zoom * 100)}%</strong></div><div><button type="button" aria-label="撤销画布编辑" disabled={!graphHistory.past.length} onClick={undo}>↶ 撤销</button><button type="button" aria-label="重做画布编辑" disabled={!graphHistory.future.length} onClick={redo}>↷ 重做</button><button type="button" aria-label="适配整张画布" onClick={fitBoardViewport}>适配</button><button type="button" aria-label="重置画布视角" onClick={resetBoardViewport}>复位</button><button type="button" onClick={step}>单步</button>{playing ? <button type="button" className="pause" aria-label="Ⅱ PAUSE / 暂停" onClick={pause}>Ⅱ 暂停</button> : <button type="button" className="run" aria-label="▶ PLAY / 运行" onClick={play}>▶ 运行</button>}<label className="sim-speed-control">速度<select aria-label="播放速度" value={playDelay} onChange={(event) => setPlayDelay(Number(event.target.value))}><option value="800">0.5×</option><option value="320">1×</option><option value="180">2×</option><option value="70">5×</option><option value="20">最快</option></select></label><button type="button" onClick={() => { clearRuntime(); setStatus('信号已清空，电路保持不变。') }} aria-label="RESET SIGNAL / 清除信号">清除信号</button><button type="button" onClick={() => { editGraph(() => createEmptyGraph()); setPendingPort(null); setSelectedWireId(null); setSelectedNodeIds([]); setSelectedComponentInstanceIds([]); setOpenComponentScope(null); setBreakpointNodeIds([]); clearRuntime(); setStatus('画布已清空。') }} aria-label="CLEAR BOARD / 清空画布">清空画布</button></div></div>
        {openComponentScope && <div className="sim-component-scope-bar" aria-label="组件编辑作用域"><span><small>组件内部 · COMPONENT SCOPE</small><strong>{openComponentScope.name}</strong><b>{openComponentScope.instance.id} · v{openComponentScope.instance.definitionRevision ?? 1}</b></span><p>当前显示这个实例的内部元件；运行 / 单步仍经过外部接线。更新定义只影响组件库和当前实例版本，其他已放置实例保持旧实现；接口变化必须另存新组件。</p><label className="sim-component-fork-name">分支名称<input aria-label="组件分叉名称" value={componentForkName} onChange={(event) => setComponentForkName(event.target.value)} /></label><button type="button" onClick={updateOpenComponentDefinition}>更新组件库定义</button><button type="button" onClick={forkOpenComponent}>另存为新组件</button><button type="button" onClick={closeComponent}>收回黑盒</button></div>}
        <div className={`sim-board-viewport ${viewportPanRef.current ? 'panning' : ''}`} ref={viewportRef} aria-label="画布视口" onWheel={zoomBoardViewport} onPointerDown={startViewportPan} onPointerMove={moveViewportPan} onPointerUp={finishViewportPan} onPointerCancel={finishViewportPan}>
        <div className="sim-board" ref={boardRef} onDragOver={(event) => event.preventDefault()} onDrop={handlePaletteDrop} onPointerDown={startBoardSelection} onPointerMove={moveBoardObjects} onPointerUp={finishBoardMove} style={{ width: BOARD_W, height: BOARD_H, transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }}>
          <svg className="sim-wire-layer" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="none" aria-label="连线层">{visibleWires.map((wire) => { const value = visibleValues[signalKey(wire.fromNodeId, wire.fromPortId)]; const from = graph.nodes.find((node) => node.id === wire.fromNodeId); const proxy = componentProxyPoint(graph, components, { nodeId: wire.fromNodeId, portId: wire.fromPortId }, 'output'); const probed = probeWireIds.includes(wire.id); return <g key={wire.id} className={`${value !== undefined ? 'hot' : ''} ${selectedWireId === wire.id ? 'selected' : ''} ${probed ? 'probed' : ''}`} onClick={() => { setSelectedWireId(wire.id); setPendingPort(null); setStatus(`已选中连线 ${wire.fromNodeId}.${wire.fromPortId} → ${wire.toNodeId}.${wire.toPortId}`) }}><path className="sim-wire-hit" d={wirePath(graph, components, wire)} /><path d={wirePath(graph, components, wire)} /><text x={(proxy?.x ?? (from?.x ?? 0) + NODE_W) + 24} y={(proxy?.y ?? (from?.y ?? 0) + 44)}>{probed ? 'P · ' : ''}{formatValue(value)}</text></g> })}{wireGesture && (() => { const from = graph.nodes.find((node) => node.id === wireGesture.from.nodeId); if (!from) return null; const definition = NODE_DEFINITIONS[from.kind]; const index = definition.outputs.findIndex((port) => port.id === wireGesture.from.portId); const proxy = componentProxyPoint(graph, components, wireGesture.from, 'output'); const x1 = proxy?.x ?? from.x + NODE_W; const y1 = proxy?.y ?? portY(from.y, index, definition.outputs.length); const bend = Math.max(42, Math.abs(wireGesture.x - x1) * .4); const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${wireGesture.x - bend} ${wireGesture.y}, ${wireGesture.x} ${wireGesture.y}`; const previewClass = wireGestureTarget ? wireGestureTarget.ok ? 'preview valid' : 'preview invalid' : 'preview'; return <g className={previewClass} aria-label="正在拉线"><path d={path} /></g> })()}</svg>
          {selectionBox && (() => { const box = normalizeBoardRect(selectionBox); return <div className="sim-selection-box" aria-hidden="true" style={{ left: `${box.left / BOARD_W * 100}%`, top: `${box.top / BOARD_H * 100}%`, width: `${(box.right - box.left) / BOARD_W * 100}%`, height: `${(box.bottom - box.top) / BOARD_H * 100}%` }} /> })()}
          {graph.nodes.filter((node) => !node.componentInstanceId).map((node) => { const definition = NODE_DEFINITIONS[node.kind]; const active = runtime && stepIndex >= 0 && runtime.steps.slice(0, stepIndex + 1).some((item) => item.nodeId === node.id); const outputValue = definition.outputs[0] ? visibleValues[signalKey(node.id, definition.outputs[0].id)] : undefined; const breakpoint = breakpointNodeIds.includes(node.id); return <div key={node.id} className={`sim-node ${active ? 'active' : ''} ${selectedNodeIds.includes(node.id) ? 'selected' : ''} ${breakpoint ? 'breakpoint' : ''}`} style={{ left: `${node.x / BOARD_W * 100}%`, top: `${node.y / BOARD_H * 100}%`, width: `${NODE_W / BOARD_W * 100}%`, height: `${NODE_H / BOARD_H * 100}%` }} onPointerDown={(event) => startMove(event, node.id)} aria-label={`节点 ${node.id}`}>
            <div className="sim-node-head"><b>{definition.short}</b><span><strong>{localizedNodeTitle(node.kind)}</strong><small>{node.id}</small></span><button type="button" className="sim-node-breakpoint" aria-label={`${breakpoint ? '取消断点' : '设置断点'} ${node.id}`} aria-pressed={breakpoint} onClick={() => setBreakpointNodeIds((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id])}>●</button><button type="button" className="sim-node-select" aria-label={`选择 ${node.id}`} aria-pressed={selectedNodeIds.includes(node.id)} onClick={() => toggleNodeSelection(node.id)}>◇</button><button type="button" aria-label={`删除 ${node.id}`} onClick={() => { editGraph((current) => removeNode(current, node.id)); setSelectedNodeIds((current) => current.filter((id) => id !== node.id)); setBreakpointNodeIds((current) => current.filter((id) => id !== node.id)); setSelectedWireId(null); clearRuntime() }}>×</button></div>
            {(node.kind === 'number-input' || node.kind === 'constant') && <input aria-label={`${node.id} 数值`} type="number" step="0.01" value={node.config?.value ?? 0} onChange={(event) => updateNumber(node.id, Number(event.target.value))} />}
            {node.kind === 'number-stream-input' && <input aria-label={`${node.id} stream`} title="使用数字，以逗号或空格分隔" type="text" value={(node.config?.numberValues ?? []).join(',')} onChange={(event) => updateNumberStream(node.id, event.target.value)} />}
            {node.kind === 'boolean-stream-input' && <input aria-label={`${node.id} stream`} title="使用 1 / 0，以逗号或空格分隔" type="text" value={(node.config?.values ?? []).map((value) => value ? '1' : '0').join(',')} onChange={(event) => updateBooleanStream(node.id, event.target.value)} />}
            {node.kind === 'boolean-output' && <output aria-label={`${node.id} 输出值`}>{formatValue(outputValue)}</output>}
            {node.kind === 'number-output' && <output aria-label={`${node.id} 输出值`}>{formatValue(outputValue)}</output>}
            <div className="sim-port-column inputs">{definition.inputs.map((port) => { const address = { nodeId: node.id, portId: port.id }; const connection = wireGesture ? canConnect(graph, wireGesture.from, address) : null; const target = wireGestureTarget?.to.nodeId === node.id && wireGestureTarget.to.portId === port.id; return <button type="button" key={port.id} className={`sim-port input ${connection ? connection.ok ? 'compatible' : 'incompatible' : ''} ${target ? 'gesture-target' : ''}`} data-sim-input-node={node.id} data-sim-input-port={port.id} aria-label={`${node.id} 输入 ${port.label} ${port.type}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropWire(event, address)} onClick={() => choosePort(address, 'input')}><i /><span>{localizedPortLabel(port.label)}</span></button> })}</div>
            <div className="sim-port-column outputs">{definition.outputs.map((port) => <button type="button" key={port.id} draggable className={`sim-port output ${pendingPort?.nodeId === node.id && pendingPort.portId === port.id ? 'pending' : ''}`} aria-label={`${node.id} 输出 ${port.label} ${port.type}`} onPointerDown={(event) => beginWireGesture(event, { nodeId: node.id, portId: port.id })} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/x-aia-port', `${node.id}::${port.id}`); setPendingPort({ nodeId: node.id, portId: port.id }); setStatus('正在拉线；拖到兼容输入端口。') }} onDragEnd={() => setPendingPort(null)} onClick={() => { if (suppressPortClickRef.current) return; choosePort({ nodeId: node.id, portId: port.id }, 'output') }}><span>{localizedPortLabel(port.label)}</span><i /></button>)}</div>
          </div> })}
          {(graph.components ?? []).map((instance) => {
            const definition = components.find((item) => item.id === instance.definitionId)
            if (!definition) return null
            const inputs = definition.ports.filter((port) => port.direction === 'input')
            const outputs = definition.ports.filter((port) => port.direction === 'output')
            const selected = selectedComponentInstanceIds.includes(instance.id)
            return <div key={instance.id} className={`sim-component-instance ${selected ? 'selected' : ''}`} style={{ left: `${instance.x / BOARD_W * 100}%`, top: `${instance.y / BOARD_H * 100}%`, width: `${COMPONENT_W / BOARD_W * 100}%`, height: `${COMPONENT_H / BOARD_H * 100}%` }} onPointerDown={(event) => startComponentMove(event, instance.id)} aria-label={`组件 ${instance.id} ${definition.name}`}>
              <div className="sim-component-head"><b>IC</b><span><strong>{definition.name}</strong><small>v{instance.definitionRevision ?? 1}{(instance.definitionRevision ?? 1) < (definition.revision ?? 1) ? ` · LIB v${definition.revision ?? 1}` : ''} · {inputs.length} IN · {outputs.length} OUT</small></span><button type="button" className="sim-component-open" aria-label={`打开组件 ${instance.id}`} title="进入黑盒内部调试；完成后可原地关闭回同一个实例" disabled={Boolean(openComponentScope)} onClick={() => openComponent(instance, definition)}>↗</button><button type="button" className="sim-node-select" aria-label={`选择组件 ${instance.id}`} aria-pressed={selected} onClick={() => toggleComponentSelection(instance.id)}>◇</button><button type="button" aria-label={`删除组件 ${instance.id}`} onClick={() => { const nodeIds = new Set(instance.nodeIds); editGraph((current) => removeComponentInstance(current, instance.id)); setSelectedComponentInstanceIds((current) => current.filter((id) => id !== instance.id)); setBreakpointNodeIds((current) => current.filter((id) => !nodeIds.has(id))); setSelectedWireId(null); clearRuntime() }}>×</button></div>
              <div className="sim-component-core"><small>玩家自制</small><strong>黑盒组件</strong>{outputs.map((port) => { const address = componentBoundaryAddress(instance, port.id); return address ? <output key={port.id}>{port.label}: {formatValue(visibleValues[signalKey(address.nodeId, address.portId)])}</output> : null })}</div>
              <div className="sim-component-ports inputs">{inputs.map((port) => { const address = componentBoundaryAddress(instance, port.id); if (!address) return null; const connection = wireGesture ? canConnect(graph, wireGesture.from, address) : null; const target = wireGestureTarget?.to.nodeId === address.nodeId && wireGestureTarget.to.portId === address.portId; return <button type="button" key={port.id} className={`sim-port input ${connection ? connection.ok ? 'compatible' : 'incompatible' : ''} ${target ? 'gesture-target' : ''}`} data-sim-input-node={address.nodeId} data-sim-input-port={address.portId} aria-label={`${definition.name} ${instance.id} 输入 ${port.label} ${port.type}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropWire(event, address)} onClick={() => choosePort(address, 'input')}><i /><span>{localizedPortLabel(port.label)}</span></button> })}</div>
              <div className="sim-component-ports outputs">{outputs.map((port) => { const address = componentBoundaryAddress(instance, port.id); if (!address) return null; return <button type="button" key={port.id} draggable className={`sim-port output ${pendingPort?.nodeId === address.nodeId && pendingPort.portId === address.portId ? 'pending' : ''}`} aria-label={`${definition.name} ${instance.id} 输出 ${port.label} ${port.type}`} onPointerDown={(event) => beginWireGesture(event, address)} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/x-aia-port', `${address.nodeId}::${address.portId}`); setPendingPort(address); setStatus('正在从自定义组件拉线；拖到兼容输入端口。') }} onDragEnd={() => setPendingPort(null)} onClick={() => { if (suppressPortClickRef.current) return; choosePort(address, 'output') }}><span>{port.label}</span><i /></button> })}</div>
            </div>
          })}
        </div>
        {visibleUnitCount === 0 && <div className="sim-empty-board"><b>空白构造台</b><span>从左侧拖入元件，或点击元件直接放置。这里没有预设答案。</span></div>}
        </div>
      </section>
      <aside className="sim-inspector" aria-label="模拟器状态"><div className="sim-panel-title"><small>运行监视 · RUNTIME</small><strong>信号与调试</strong></div><div className="sim-status" role="status">{status}</div>
        <section aria-label="画布视角说明"><small>画布视角</small><strong>{Math.round(viewport.zoom * 100)}% 缩放</strong><p>滚轮围绕指针缩放；按住 Space + 左键拖动，或直接中键拖动，可以平移大画布。FIT 会显示整张构造世界，不改机器本身。</p></section>
        {editingComponentId && (() => {
          const definition = components.find((item) => item.id === editingComponentId)
          if (!definition) return null
          return <section className="sim-component-interface-editor" aria-label="组件接口编辑器"><small>组件接口</small><strong>{definition.name}</strong><p>只改黑盒对外语言，不改内部电路、typed ports 或已有实例接线。</p><label>组件名称<input aria-label="组件显示名称" defaultValue={definition.name} onBlur={(event) => updateComponentInterface(definition.id, { name: event.currentTarget.value })} /></label><div className="sim-component-interface-ports">{definition.ports.map((port) => <label key={port.id}><span>{port.direction === 'input' ? '输入' : '输出'} · {localizedSignalType(port.type)}</span><input aria-label={`组件端口 ${port.id} 标签`} defaultValue={port.label} onBlur={(event) => updateComponentInterface(definition.id, { portLabels: { [port.id]: event.currentTarget.value } })} /></label>)}</div><button type="button" onClick={() => setEditingComponentId(null)}>完成</button></section>
        })()}
        {selectedTerminalNode && <section className="sim-terminal-editor" aria-label="I/O 端口契约"><small>I/O 契约</small><strong>{simulatorTerminalName(selectedTerminalNode)}</strong><p>测试台优先按这个名字绑定输入/输出，而不是绑定内部 node id。重搭线路时保留同名 terminal，旧测试仍可复用。</p><label>端口名称<input aria-label={`${selectedTerminalNode.id} terminal name`} value={selectedTerminalNode.config?.label ?? ''} onChange={(event) => updateTerminalLabel(selectedTerminalNode.id, event.target.value)} /></label></section>}
        <section className="sim-blueprint-inspector" aria-label="蓝图工具"><small>复用工具 · REUSE</small><strong>{selectedNodeIds.length || selectedComponentInstanceIds.length ? `已选择 ${selectedNodeIds.length + selectedComponentInstanceIds.length} 个单元` : '选择节点或组件'}</strong><p>空白处拖框可批量选择；拖动任一已选单元会整体移动，Delete 可整组删除。蓝图复制元件结构；组件则把结构封装成可以继续组合的高一级零件。</p><input aria-label="蓝图名称" value={blueprintName} onChange={(event) => setBlueprintName(event.target.value)} placeholder="例如：风险阈值器" /><button type="button" disabled={!selectedNodeIds.length || selectedComponentInstanceIds.length > 0} onClick={saveBlueprint} aria-label="SAVE BLUEPRINT / 保存蓝图">保存蓝图</button><button type="button" disabled={Boolean(openComponentScope) || (!selectedNodeIds.length && !selectedComponentInstanceIds.length)} onClick={saveComponent} aria-label="SAVE COMPONENT / 封装组件">封装组件</button>{(selectedNodeIds.length > 0 || selectedComponentInstanceIds.length > 0) && <button type="button" onClick={() => { setSelectedNodeIds([]); setSelectedComponentInstanceIds([]) }}>取消选择</button>}</section>
        <section className="sim-test-bench" aria-label="模拟器测试台"><small>回归测试台 · TEST HARNESS</small><strong>{benchTests.length ? `已保存 ${benchTests.length} 个样例` : '尚未记录测试'}</strong><p>把当前 I/O 行为冻结成回归样例。测试优先绑定命名 terminal，所以内部线路甚至 node id 全部重做后，只要 I/O 契约没变，旧样例仍能验收。</p><input aria-label="测试名称" value={benchTestName} onChange={(event) => setBenchTestName(event.target.value)} placeholder="例如：score=0.72 应通过" /><div className="sim-test-bench-actions"><button type="button" onClick={captureBenchTest}>记录当前行为</button><button type="button" disabled={!benchTests.length} onClick={runBenchTests}>运行全部测试</button></div>{benchTests.map((test) => { const result = benchResults.find((item) => item.id === test.id); return <div className={`sim-test-case ${result ? result.passed ? 'pass' : 'fail' : ''}`} key={test.id}><span><b>{test.name}</b><small>{test.inputs.map((input) => input.terminal ?? input.nodeId).join(', ')} → {test.expected.map((output) => output.terminal ?? output.nodeId).join(', ')}</small></span><strong>{result ? result.passed ? '通过' : '失败' : '待运行'}</strong><div><button type="button" onClick={() => loadBenchInputs(test.id)}>载入输入</button><button type="button" aria-label={`删除测试 ${test.name}`} onClick={() => { setBenchTests((current) => current.filter((item) => item.id !== test.id)); setBenchResults((current) => current.filter((item) => item.id !== test.id)) }}>×</button></div>{result?.error && <em>{result.error}</em>}{result && !result.error && result.outputs.map((output) => <em key={`${output.terminal ?? output.nodeId}-${output.nodeId}`}>{output.terminal ?? output.nodeId}: {formatValue(output.actual)} / 预期 {formatValue(output.expected)}</em>)}</div> })}</section>
                {selectedWireId && (() => {
                  const wire = graph.wires.find((item) => item.id === selectedWireId)
                  if (!wire) return null
                  const probed = probeWireIds.includes(wire.id)
                  const signalType = probeSignalType(wire.id)
                  const condition = probeBreakConditions[wire.id]
                  const isBooleanSignal = signalType === 'boolean' || signalType === 'boolean-stream'
                  const isNumberSignal = signalType === 'number' || signalType === 'number-stream'
                  const numberThreshold = condition && condition.mode !== 'boolean' ? condition.threshold : 0.5
                  return <section className="sim-wire-inspector"><small>已选连线</small><strong>{wire.fromNodeId}.{wire.fromPortId}</strong><p>→ {wire.toNodeId}.{wire.toPortId}</p>
                    <button type="button" onClick={() => {
                      setProbeWireIds((current) => probed ? current.filter((id) => id !== wire.id) : [...current, wire.id])
                      if (probed) setProbeBreakConditions((current) => Object.fromEntries(Object.entries(current).filter(([wireId]) => wireId !== wire.id)))
                      setStatus(probed ? 'SIGNAL PROBE REMOVED' : 'SIGNAL PROBE PINNED · STEP / PLAY 时持续观察这根线。')
                    }}>{probed ? '移除探针' : '固定信号探针'}</button>
                    {probed && <div className="sim-probe-break-config" aria-label="探针条件暂停">
                      <small>条件暂停</small><strong>{probeBreakLabel(condition)}</strong>
                      {isBooleanSignal && <div><button type="button" aria-pressed={condition?.mode === 'boolean' && condition.value} onClick={() => setProbeBreakConditions((current) => ({ ...current, [wire.id]: { mode: 'boolean', value: true } }))}>遇到 TRUE 暂停</button><button type="button" aria-pressed={condition?.mode === 'boolean' && !condition.value} onClick={() => setProbeBreakConditions((current) => ({ ...current, [wire.id]: { mode: 'boolean', value: false } }))}>遇到 FALSE 暂停</button></div>}
                      {isNumberSignal && <><input aria-label="探针断点阈值" type="number" step="0.01" value={numberThreshold} onChange={(event) => { const threshold = Number(event.target.value); if (!Number.isFinite(threshold)) return; setProbeBreakConditions((current) => ({ ...current, [wire.id]: condition?.mode === 'number-at-most' ? { mode: 'number-at-most', threshold } : { mode: 'number-at-least', threshold } })) }} /><div><button type="button" aria-pressed={condition?.mode === 'number-at-least'} onClick={() => setProbeBreakConditions((current) => ({ ...current, [wire.id]: { mode: 'number-at-least', threshold: numberThreshold } }))}>达到 ≥ 暂停</button><button type="button" aria-pressed={condition?.mode === 'number-at-most'} onClick={() => setProbeBreakConditions((current) => ({ ...current, [wire.id]: { mode: 'number-at-most', threshold: numberThreshold } }))}>达到 ≤ 暂停</button></div></>}
                      {condition && <button type="button" onClick={() => setProbeBreakConditions((current) => Object.fromEntries(Object.entries(current).filter(([wireId]) => wireId !== wire.id)))}>关闭条件暂停</button>}
                    </div>}
                    <button type="button" onClick={() => { editGraph((current) => removeWire(current, wire.id)); setSelectedWireId(null); clearRuntime(); setStatus('连线已移除；节点保持不变，可以重新接线。') }}>删除连线</button>
                  </section>
                })()}
        {probeReadings.length > 0 && <section className="sim-probe-panel" aria-label="信号探针"><small>信号探针</small>{probeReadings.map((probe, index) => <div key={probe.wireId} className="sim-probe-row"><b>P{index + 1}</b><span><strong>{probe.from}</strong><small>→ {probe.to}</small></span><output>{formatValue(probe.latest)}</output>{probeBreakConditions[probe.wireId] && <i>{probeBreakLabel(probeBreakConditions[probe.wireId])}</i>}{Array.isArray(probe.value) && <em>{probe.sampleCount} 个样本 · {formatValue(probe.value)}</em>}</div>)}</section>}
        <section><small>接线状态</small><strong>{pendingPort ? `${pendingPort.nodeId}.${pendingPort.portId}` : '空闲'}</strong><p>{pendingPort ? '现在点一个同类型输入端口。' : '点击输出端口，再点击输入端口。'}</p>{pendingPort && <button type="button" onClick={() => setPendingPort(null)}>取消连线</button>}</section>
        {streamClockLength(graph) > 0 && <section><small>样本时钟</small><strong>{runtimeSession ? `${runtimeSession.tick} / ${streamClockLength(graph)} · 节点 ${runtimeSession.nodeIndex + 1}` : `0 / ${streamClockLength(graph)}`}</strong><p>STEP 每次只执行当前样本的一个节点；走完整张图后才推进到下一个样本。</p></section>}
        <section><small>执行轨迹</small>{runtime ? traceRows.map((item, index) => <div key={`${item.key}-${index}`} className={`sim-trace-row ${item.stepIndex <= stepIndex ? 'done' : ''}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.label}</span><strong>{item.value}</strong></div>) : <p>运行或单步后，这里显示当前时钟内的实际求值顺序；自制组件只作为一个黑盒显示，不泄露内部节点。</p>}</section>
        <section><small>模拟器约定</small><p>界面只负责编辑图；真实求值由独立 graph/runtime 完成。以后关卡只提供 I/O 与测试，不拥有模拟器规则。</p></section>
      </aside>
    </div>
  </main>
}
