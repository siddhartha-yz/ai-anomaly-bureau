import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { NODE_DEFINITIONS, SIMULATOR_PALETTE } from './catalog'
import { canConnect, connect, createEmptyGraph, createNode, removeNode } from './graph'
import { evaluateGraph, visibleValuesAfterStep } from './runtime'
import { signalKey, type PortAddress, type RuntimeResult, type SignalValue, type SimulatorGraph, type SimulatorNodeKind } from './types'

const STORAGE_KEY = 'aia.simulator-v3.board.v1'
const NODE_W = 164
const NODE_H = 104
const BOARD_W = 1120
const BOARD_H = 620

function formatValue(value: SignalValue | undefined) {
  if (value === undefined) return '—'
  if (Array.isArray(value)) return `[${value.map((item) => item ? 'T' : 'F').join(' ')}]`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return '—'
}

function parseBooleanStream(raw: string) {
  const tokens = raw.split(/[\s,;|]+/).map((token) => token.trim()).filter(Boolean)
  if (tokens.some((token) => token !== '0' && token !== '1')) return null
  return tokens.map((token) => token === '1')
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
  const [stepIndex, setStepIndex] = useState(-1)
  const [status, setStatus] = useState('空白板已就绪。拖入元件，自己接线。')
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)) } catch { /* persistence is optional */ }
  }, [graph])

  const visibleValues = useMemo(() => runtime && stepIndex >= 0 ? visibleValuesAfterStep(runtime, stepIndex) : {}, [runtime, stepIndex])
  const nextNodeId = (kind: SimulatorNodeKind) => {
    const prefix = kind.replaceAll('-', '_')
    let index = 1
    while (graph.nodes.some((node) => node.id === `${prefix}_${index}`)) index += 1
    return `${prefix}_${index}`
  }
  const clearRuntime = () => { setRuntime(null); setStepIndex(-1) }

  const addNode = (kind: SimulatorNodeKind, x?: number, y?: number) => {
    const id = nextNodeId(kind)
    const sameKindCount = graph.nodes.filter((node) => node.kind === kind).length
    const defaults: Record<SimulatorNodeKind, { x: number; y: number }> = {
      'number-input': { x: 70, y: 110 },
      constant: { x: 70, y: 300 },
      'greater-than': { x: 450, y: 205 },
      'boolean-output': { x: 820, y: 205 },
      'boolean-stream-input': { x: 60, y: 80 },
      'stream-equal': { x: 310, y: 150 },
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
    setPendingPort(null); clearRuntime(); setStatus('连线完成。')
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

  const run = () => {
    try {
      const result = evaluateGraph(graph)
      setRuntime(result); setStepIndex(result.steps.length - 1); setStatus(`运行完成：${result.steps.length} 个节点已求值。`)
    } catch (error) { clearRuntime(); setStatus(error instanceof Error ? error.message : '运行失败。') }
  }

  const step = () => {
    try {
      const result = runtime ?? evaluateGraph(graph)
      const next = Math.min(result.steps.length - 1, stepIndex + 1)
      setRuntime(result); setStepIndex(next)
      const node = graph.nodes.find((item) => item.id === result.steps[next]?.nodeId)
      setStatus(node ? `STEP ${next + 1}/${result.steps.length} · ${NODE_DEFINITIONS[node.kind].title}` : '没有更多步骤。')
    } catch (error) { clearRuntime(); setStatus(error instanceof Error ? error.message : '单步执行失败。') }
  }

  const updateNumber = (nodeId: string, value: number) => {
    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, value } } : node) }))
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
        <div className="sim-palette-note"><small>自由实验</small><p>标量可以搭阈值机；stream 原语可以自己拼出“匹配比例”。这里没有 Accuracy 成品节点。</p></div>
      </aside>
      <section className="sim-board-wrap" aria-label="构造画布">
        <div className="sim-toolbar"><div><small>BOARD</small><strong>{graph.nodes.length} NODES · {graph.wires.length} WIRES</strong></div><div><button type="button" onClick={step}>STEP</button><button type="button" className="run" onClick={run}>▶ PLAY</button><button type="button" onClick={() => { clearRuntime(); setStatus('信号已清空，电路保持不变。') }}>RESET SIGNAL</button><button type="button" onClick={() => { setGraph(createEmptyGraph()); setPendingPort(null); clearRuntime(); setStatus('画布已清空。') }}>CLEAR BOARD</button></div></div>
        <div className="sim-board" ref={boardRef} onDragOver={(event) => event.preventDefault()} onDrop={handlePaletteDrop} onPointerMove={moveNode} onPointerUp={() => { dragRef.current = null }} style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}>
          <svg className="sim-wire-layer" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="none" aria-label="连线层">{graph.wires.map((wire) => { const value = visibleValues[signalKey(wire.fromNodeId, wire.fromPortId)]; const from = graph.nodes.find((node) => node.id === wire.fromNodeId); return <g key={wire.id} className={value !== undefined ? 'hot' : ''}><path d={wirePath(graph, wire)} /><text x={(from?.x ?? 0) + NODE_W + 24} y={(from?.y ?? 0) + 44}>{formatValue(value)}</text></g> })}</svg>
          {graph.nodes.map((node) => { const definition = NODE_DEFINITIONS[node.kind]; const active = runtime && stepIndex >= 0 && runtime.steps.slice(0, stepIndex + 1).some((item) => item.nodeId === node.id); const outputValue = definition.outputs[0] ? visibleValues[signalKey(node.id, definition.outputs[0].id)] : undefined; return <div key={node.id} className={`sim-node ${active ? 'active' : ''}`} style={{ left: `${node.x / BOARD_W * 100}%`, top: `${node.y / BOARD_H * 100}%`, width: `${NODE_W / BOARD_W * 100}%`, height: `${NODE_H / BOARD_H * 100}%` }} onPointerDown={(event) => startMove(event, node.id)} aria-label={`节点 ${node.id}`}>
            <div className="sim-node-head"><b>{definition.short}</b><span><strong>{definition.title}</strong><small>{node.id}</small></span><button type="button" aria-label={`删除 ${node.id}`} onClick={() => { setGraph((current) => removeNode(current, node.id)); clearRuntime() }}>×</button></div>
            {(node.kind === 'number-input' || node.kind === 'constant') && <input aria-label={`${node.id} 数值`} type="number" step="0.01" value={node.config?.value ?? 0} onChange={(event) => updateNumber(node.id, Number(event.target.value))} />}
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
        <section><small>WIRE MODE</small><strong>{pendingPort ? `${pendingPort.nodeId}.${pendingPort.portId}` : 'IDLE'}</strong><p>{pendingPort ? '现在点一个同类型输入端口。' : '点击输出端口，再点击输入端口。'}</p>{pendingPort && <button type="button" onClick={() => setPendingPort(null)}>取消连线</button>}</section>
        <section><small>STEP TRACE</small>{runtime ? runtime.steps.map((item, index) => <div key={item.nodeId} className={`sim-trace-row ${index <= stepIndex ? 'done' : ''}`}><b>{String(index + 1).padStart(2, '0')}</b><span>{item.nodeId}</span><strong>{Object.values(item.outputs).map(formatValue).join(', ')}</strong></div>) : <p>PLAY 或 STEP 后，这里显示实际求值顺序。</p>}</section>
        <section><small>SANDBOX CONTRACT</small><p>React 只编辑图。真实求值由独立 TypeScript graph/runtime 完成；以后关卡只提供 I/O 与测试，不拥有模拟器规则。</p></section>
      </aside>
    </div>
  </main>
}
