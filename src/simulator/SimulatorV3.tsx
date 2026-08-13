import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { NODE_DEFINITIONS, SIMULATOR_PALETTE } from './catalog'
import { createBlueprint, instantiateBlueprint, parseBlueprints, type SimulatorBlueprint } from './blueprints'
import { canConnect, connect, createEmptyGraph, createNode, removeNode, removeWire } from './graph'
import { createRuntimeSession, evaluateGraph, stepRuntimeSession, streamClockLength, visibleValuesAfterStep } from './runtime'
import { signalKey, type PortAddress, type RuntimeResult, type RuntimeSession, type SignalValue, type SimulatorGraph, type SimulatorNodeKind } from './types'

const STORAGE_KEY = 'aia.simulator-v3.board.v1'
const BLUEPRINT_STORAGE_KEY = 'aia.simulator-v3.blueprints.v1'
const NODE_W = 164
const NODE_H = 104
const BOARD_W = 1120
const BOARD_H = 620

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

function readGraph(): SimulatorGraph {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyGraph()
    const parsed = JSON.parse(raw) as SimulatorGraph
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.wires)) return createEmptyGraph()
    return parsed
  } catch {
    return createEmptyGraph()
  }
}

function portY(nodeY: number, index: number, count: number) {
  if (count <= 1) return nodeY + NODE_H / 2
  return nodeY + 38 + index * ((NODE_H - 54) / (count - 1))
}

function wirePath(graph: SimulatorGraph, wire: SimulatorGraph['wires'][number]) {
  const from = graph.nodes.find((node) => node.id === wire.fromNodeId)
  const to = graph.nodes.find((node) => node.id === wire.toNodeId)
  if (!from || !to) return ''
  const fromDef = NODE_DEFINITIONS[from.kind]
  const toDef = NODE_DEFINITIONS[to.kind]
  const fromIndex = fromDef.outputs.findIndex((port) => port.id === wire.fromPortId)
  const toIndex = toDef.inputs.findIndex((port) => port.id === wire.toPortId)
  const x1 = from.x + NODE_W
  const y1 = portY(from.y, fromIndex, fromDef.outputs.length)
  const x2 = to.x
  const y2 = portY(to.y, toIndex, toDef.inputs.length)
  const bend = Math.max(48, Math.abs(x2 - x1) * .45)
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

export function SimulatorV3() {
  const [graph, setGraph] = useState<SimulatorGraph>(() => readGraph())
  const [pendingPort, setPendingPort] = useState<PortAddress | null>(null)
  const [runtime, setRuntime] = useState<RuntimeResult | null>(null)
  const [runtimeSession, setRuntimeSession] = useState<RuntimeSession | null>(null)
  const [stepIndex, setStepIndex] = useState(-1)
  const [clockTickIndex, setClockTickIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [playDelay, setPlayDelay] = useState(180)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [blueprints, setBlueprints] = useState<SimulatorBlueprint[]>(() => readBlueprints())
  const [blueprintName, setBlueprintName] = useState('')
  const [status, setStatus] = useState('空白板已就绪。拖入元件，自己接线。')
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)) } catch { /* persistence is optional */ }
  }, [graph])
  useEffect(() => {
    try { window.localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(blueprints)) } catch { /* persistence is optional */ }
  }, [blueprints])

  const visibleValues = useMemo(() => runtime && stepIndex >= 0 ? visibleValuesAfterStep(runtime, stepIndex) : {}, [runtime, stepIndex])
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
    setGraph((current) => ({ ...current, nodes: [...current.nodes, createNode(kind, id, Math.min(BOARD_W - NODE_W - 18, x ?? fallback.x + staggerX), Math.min(BOARD_H - NODE_H - 18, y ?? fallback.y + staggerY))] }))
    clearRuntime()
    setStatus(`${NODE_DEFINITIONS[kind].title} 已放入画布。`)
  }

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds((current) => current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId])
    setSelectedWireId(null)
  }

  const saveBlueprint = () => {
    try {
      const id = `bp_${Date.now()}`
      const blueprint = createBlueprint(graph, selectedNodeIds, id, blueprintName)
      setBlueprints((current) => [...current, blueprint])
      setSelectedNodeIds([])
      setBlueprintName('')
      setStatus(`BLUEPRINT SAVED · ${blueprint.name} · ${blueprint.nodes.length} nodes`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '蓝图保存失败。')
    }
  }

  const placeBlueprint = (blueprint: SimulatorBlueprint) => {
    setGraph((current) => {
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
    clearRuntime()
    setStatus(`BLUEPRINT PLACED · ${blueprint.name}`)
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
    setGraph((current) => connect(current, { id: wireId, fromNodeId: from.nodeId, fromPortId: from.portId, toNodeId: to.nodeId, toPortId: to.portId }))
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

  const advanceStep = useCallback((fromPlayback = false) => {
    try {
      const clockLength = streamClockLength(graph)
      if (clockLength > 0) {
        const session = runtimeSession ?? createRuntimeSession(graph)
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
        if (complete && fromPlayback) setPlaying(false)
        setStatus(complete
          ? fromPlayback
            ? `PLAY COMPLETE · ${frame.totalTicks} 个样本时钟已执行。`
            : `SAMPLE ${frame.tick}/${frame.totalTicks} · NODE ${frame.nodeIndex + 1}/${frame.nodeCount}${node ? ` · ${NODE_DEFINITIONS[node.kind].title}` : ''} · SAMPLE COMPLETE · ALL SAMPLES COMPLETE`
          : `SAMPLE ${frame.tick}/${frame.totalTicks} · NODE ${frame.nodeIndex + 1}/${frame.nodeCount}${node ? ` · ${NODE_DEFINITIONS[node.kind].title}` : ''}${frame.sampleComplete ? ' · SAMPLE COMPLETE' : ''}`)
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
      setRuntime(result); setStepIndex(next)
      const node = graph.nodes.find((item) => item.id === result.steps[next]?.nodeId)
      const complete = next === result.steps.length - 1
      if (complete && fromPlayback) setPlaying(false)
      setStatus(complete
        ? fromPlayback
          ? `PLAY COMPLETE · ${result.steps.length} 个节点已求值。`
          : node ? `NODE ${next + 1}/${result.steps.length} · ${NODE_DEFINITIONS[node.kind].title} · COMPLETE` : 'COMPLETE'
        : node ? `NODE ${next + 1}/${result.steps.length} · ${NODE_DEFINITIONS[node.kind].title}` : '没有更多步骤。')
      return complete
    } catch (error) {
      clearRuntime()
      setStatus(error instanceof Error ? error.message : '单步执行失败。')
      return true
    }
  }, [clearRuntime, graph, runtime, runtimeSession, stepIndex])

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
      setStatus('PLAYING · 每个时钟只推进一个节点。随时可以 PAUSE。')
    } catch (error) {
      clearRuntime()
      setStatus(error instanceof Error ? error.message : '运行失败。')
    }
  }

  const pause = () => {
    setPlaying(false)
    setStatus('PAUSED · 当前信号状态已冻结，可以检查连线或继续 STEP。')
  }

  const step = () => {
    if (playing) setPlaying(false)
    advanceStep(false)
  }

  const updateNumber = (nodeId: string, value: number) => {
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, value } } : node) }))
    clearRuntime()
  }

  const updateNumberStream = (nodeId: string, raw: string) => {
    const numberValues = parseNumberStream(raw)
    if (!numberValues) { setStatus('NUMBER STREAM 只接受有限数字，以逗号或空格分隔。'); return }
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, numberValues } } : node) }))
    clearRuntime()
  }

  const updateBooleanStream = (nodeId: string, raw: string) => {
    const values = parseBooleanStream(raw)
    if (!values) { setStatus('BOOLEAN STREAM 只接受 1 / 0，以逗号或空格分隔。'); return }
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, values } } : node) }))
    clearRuntime()
  }

  const startMove = (event: ReactPointerEvent<HTMLDivElement>, nodeId: string) => {
    if ((event.target as HTMLElement).closest('button, input')) return
    const node = graph.nodes.find((item) => item.id === nodeId)
    const board = boardRef.current
    if (!node || !board) return
    const rect = board.getBoundingClientRect()
    dragRef.current = { nodeId, offsetX: (event.clientX - rect.left) * (BOARD_W / rect.width) - node.x, offsetY: (event.clientY - rect.top) * (BOARD_H / rect.height) - node.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveNode = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const board = boardRef.current
    if (!drag || !board) return
    const rect = board.getBoundingClientRect()
    const x = Math.max(8, Math.min(BOARD_W - NODE_W - 8, (event.clientX - rect.left) * (BOARD_W / rect.width) - drag.offsetX))
    const y = Math.max(8, Math.min(BOARD_H - NODE_H - 8, (event.clientY - rect.top) * (BOARD_H / rect.height) - drag.offsetY))
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === drag.nodeId ? { ...node, x, y } : node) }))
  }

  return <main className="sim-v3-shell" aria-label="AI系统模拟器 V3">
    <header className="sim-v3-header"><div><b>AIA / SIM</b><span><strong>CONSTRUCTION SANDBOX</strong><small>V3 · NO LEVEL · NO ANSWER KEY</small></span></div><div className="sim-v3-header-actions"><button type="button" onClick={() => { window.location.href = '?v2=1' }}>V2 PROTOTYPE</button><button type="button" onClick={() => { window.location.href = '?legacy=1' }}>LEGACY</button></div></header>
    <div className="sim-v3-layout">
      <aside className="sim-palette" aria-label="元件库"><div className="sim-panel-title"><small>PRIMITIVES</small><strong>元件库</strong></div>
        {SIMULATOR_PALETTE.map((kind) => { const definition = NODE_DEFINITIONS[kind]; return <button type="button" key={kind} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-aia-node', kind)} onClick={() => addNode(kind)} className="sim-palette-item" aria-label={`添加 ${definition.title}`}><b>{definition.short}</b><span><strong>{definition.title}</strong><small>{definition.outputs.map((port) => port.type).join(' · ') || definition.inputs.map((port) => port.type).join(' · ')}</small></span></button> })}
        {blueprints.length > 0 && <div className="sim-blueprint-list" aria-label="我的蓝图"><small>MY BLUEPRINTS</small>{blueprints.map((blueprint) => <button type="button" key={blueprint.id} onClick={() => placeBlueprint(blueprint)}><b>BP</b><span><strong>{blueprint.name}</strong><small>{blueprint.nodes.length} nodes · {blueprint.wires.length} wires</small></span></button>)}</div>}
        <div className="sim-palette-note"><small>自由实验</small><p>标量可以搭阈值机；NUMBER STREAM 可以逐样本过阈值，再接布尔 stream 原语自己拼指标。这里没有 Accuracy / Recall 成品节点。</p></div>
      </aside>
      <section className="sim-board-wrap" aria-label="构造画布">
        <div className="sim-toolbar"><div><small>BOARD</small><strong>{graph.nodes.length} NODES · {graph.wires.length} WIRES{streamClockLength(graph) ? ` · CLOCK ${clockTickIndex + 1}/${streamClockLength(graph)}` : ''}{playing ? ' · RUNNING' : ''}</strong></div><div><button type="button" onClick={step}>STEP</button>{playing ? <button type="button" className="pause" onClick={pause}>Ⅱ PAUSE</button> : <button type="button" className="run" onClick={play}>▶ PLAY</button>}<label className="sim-speed-control">SPEED<select aria-label="播放速度" value={playDelay} onChange={(event) => setPlayDelay(Number(event.target.value))}><option value="800">0.5×</option><option value="320">1×</option><option value="180">2×</option><option value="70">5×</option><option value="20">FAST</option></select></label><button type="button" onClick={() => { clearRuntime(); setStatus('信号已清空，电路保持不变。') }}>RESET SIGNAL</button><button type="button" onClick={() => { setGraph(createEmptyGraph()); setPendingPort(null); setSelectedWireId(null); clearRuntime(); setStatus('画布已清空。') }}>CLEAR BOARD</button></div></div>
        <div className="sim-board" ref={boardRef} onDragOver={(event) => event.preventDefault()} onDrop={handlePaletteDrop} onPointerMove={moveNode} onPointerUp={() => { dragRef.current = null }} style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}>
          <svg className="sim-wire-layer" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="none" aria-label="连线层">{graph.wires.map((wire) => { const value = visibleValues[signalKey(wire.fromNodeId, wire.fromPortId)]; const from = graph.nodes.find((node) => node.id === wire.fromNodeId); return <g key={wire.id} className={`${value !== undefined ? 'hot' : ''} ${selectedWireId === wire.id ? 'selected' : ''}`} onClick={() => { setSelectedWireId(wire.id); setPendingPort(null); setStatus(`已选中连线 ${wire.fromNodeId}.${wire.fromPortId} → ${wire.toNodeId}.${wire.toPortId}`) }}><path className="sim-wire-hit" d={wirePath(graph, wire)} /><path d={wirePath(graph, wire)} /><text x={(from?.x ?? 0) + NODE_W + 24} y={(from?.y ?? 0) + 44}>{formatValue(value)}</text></g> })}</svg>
          {graph.nodes.map((node) => { const definition = NODE_DEFINITIONS[node.kind]; const active = runtime && stepIndex >= 0 && runtime.steps.slice(0, stepIndex + 1).some((item) => item.nodeId === node.id); const outputValue = definition.outputs[0] ? visibleValues[signalKey(node.id, definition.outputs[0].id)] : undefined; return <div key={node.id} className={`sim-node ${active ? 'active' : ''} ${selectedNodeIds.includes(node.id) ? 'selected' : ''}`} style={{ left: `${node.x / BOARD_W * 100}%`, top: `${node.y / BOARD_H * 100}%`, width: `${NODE_W / BOARD_W * 100}%`, height: `${NODE_H / BOARD_H * 100}%` }} onPointerDown={(event) => startMove(event, node.id)} aria-label={`节点 ${node.id}`}>
            <div className="sim-node-head"><b>{definition.short}</b><span><strong>{definition.title}</strong><small>{node.id}</small></span><button type="button" className="sim-node-select" aria-label={`选择 ${node.id}`} aria-pressed={selectedNodeIds.includes(node.id)} onClick={() => toggleNodeSelection(node.id)}>◇</button><button type="button" aria-label={`删除 ${node.id}`} onClick={() => { setGraph((current) => removeNode(current, node.id)); setSelectedNodeIds((current) => current.filter((id) => id !== node.id)); setSelectedWireId(null); clearRuntime() }}>×</button></div>
            {(node.kind === 'number-input' || node.kind === 'constant') && <input aria-label={`${node.id} 数值`} type="number" step="0.01" value={node.config?.value ?? 0} onChange={(event) => updateNumber(node.id, Number(event.target.value))} />}
            {node.kind === 'number-stream-input' && <input aria-label={`${node.id} stream`} title="使用数字，以逗号或空格分隔" type="text" value={(node.config?.numberValues ?? []).join(',')} onChange={(event) => updateNumberStream(node.id, event.target.value)} />}
            {node.kind === 'boolean-stream-input' && <input aria-label={`${node.id} stream`} title="使用 1 / 0，以逗号或空格分隔" type="text" value={(node.config?.values ?? []).map((value) => value ? '1' : '0').join(',')} onChange={(event) => updateBooleanStream(node.id, event.target.value)} />}
            {node.kind === 'boolean-output' && <output aria-label={`${node.id} 输出值`}>{formatValue(outputValue)}</output>}
            {node.kind === 'number-output' && <output aria-label={`${node.id} 输出值`}>{formatValue(outputValue)}</output>}
            <div className="sim-port-column inputs">{definition.inputs.map((port) => <button type="button" key={port.id} className="sim-port input" aria-label={`${node.id} 输入 ${port.label} ${port.type}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropWire(event, { nodeId: node.id, portId: port.id })} onClick={() => choosePort({ nodeId: node.id, portId: port.id }, 'input')}><i /><span>{port.label}</span></button>)}</div>
            <div className="sim-port-column outputs">{definition.outputs.map((port) => <button type="button" key={port.id} draggable className={`sim-port output ${pendingPort?.nodeId === node.id && pendingPort.portId === port.id ? 'pending' : ''}`} aria-label={`${node.id} 输出 ${port.label} ${port.type}`} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/x-aia-port', `${node.id}::${port.id}`); setPendingPort({ nodeId: node.id, portId: port.id }); setStatus('正在拉线；拖到兼容输入端口。') }} onDragEnd={() => setPendingPort(null)} onClick={() => choosePort({ nodeId: node.id, portId: port.id }, 'output')}><span>{port.label}</span><i /></button>)}</div>
          </div> })}
          {!graph.nodes.length && <div className="sim-empty-board"><b>EMPTY CONSTRUCTION BOARD</b><span>把左侧元件拖进来。这里没有预设管线。</span></div>}
        </div>
      </section>
      <aside className="sim-inspector" aria-label="模拟器状态"><div className="sim-panel-title"><small>RUNTIME</small><strong>信号 / Debug</strong></div><div className="sim-status" role="status">{status}</div>
        <section className="sim-blueprint-inspector" aria-label="蓝图工具"><small>BLUEPRINT TOOL</small><strong>{selectedNodeIds.length ? `${selectedNodeIds.length} NODES SELECTED` : 'SELECT NODES'}</strong><p>用节点标题栏的 ◇ 选择一组结构；保存后会保留内部连线，再次放入时边界端口保持开放。</p><input aria-label="蓝图名称" value={blueprintName} onChange={(event) => setBlueprintName(event.target.value)} placeholder="例如 MY RECALL RIG" /><button type="button" disabled={!selectedNodeIds.length} onClick={saveBlueprint}>SAVE BLUEPRINT</button>{selectedNodeIds.length > 0 && <button type="button" onClick={() => setSelectedNodeIds([])}>CLEAR SELECTION</button>}</section>
                {selectedWireId && (() => { const wire = graph.wires.find((item) => item.id === selectedWireId); if (!wire) return null; return <section className="sim-wire-inspector"><small>SELECTED WIRE</small><strong>{wire.fromNodeId}.{wire.fromPortId}</strong><p>→ {wire.toNodeId}.{wire.toPortId}</p><button type="button" onClick={() => { setGraph((current) => removeWire(current, wire.id)); setSelectedWireId(null); clearRuntime(); setStatus('连线已移除；节点保持不变，可以重新接线。') }}>DELETE WIRE</button></section> })()}
        <section><small>WIRE MODE</small><strong>{pendingPort ? `${pendingPort.nodeId}.${pendingPort.portId}` : 'IDLE'}</strong><p>{pendingPort ? '现在点一个同类型输入端口。' : '点击输出端口，再点击输入端口。'}</p>{pendingPort && <button type="button" onClick={() => setPendingPort(null)}>取消连线</button>}</section>
        {streamClockLength(graph) > 0 && <section><small>SAMPLE CLOCK</small><strong>{runtimeSession ? `${runtimeSession.tick} / ${streamClockLength(graph)} · NODE ${runtimeSession.nodeIndex + 1}` : `0 / ${streamClockLength(graph)}`}</strong><p>STEP 每次只执行当前样本的一个节点；走完整张图后才推进到下一个样本。</p></section>}
        <section><small>STEP TRACE</small>{runtime ? runtime.steps.map((item, index) => <div key={item.nodeId} className={`sim-trace-row ${index <= stepIndex ? 'done' : ''}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.nodeId}</span><strong>{Object.values(item.outputs).map(formatValue).join(', ')}</strong></div>) : <p>PLAY 或 STEP 后，这里显示当前时钟内的实际求值顺序。</p>}</section>
        <section><small>SANDBOX CONTRACT</small><p>React 只编辑图。真实求值由独立 TypeScript graph/runtime 完成；以后关卡只提供 I/O 与测试，不拥有模拟器规则。</p></section>
      </aside>
    </div>
  </main>
}
