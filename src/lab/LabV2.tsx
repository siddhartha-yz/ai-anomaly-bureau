import { useEffect, useMemo, useReducer } from 'react'
import {
  LAB_LEVELS,
  evaluateLevelOne,
  evaluateScreening,
  evaluateShift,
  levelOneFeatureLabels,
  screeningScoreRail,
  shiftFeatureLabels,
  type LabLevel,
  type LabTool,
  type LevelOneFeature,
  type ShiftEnvironment,
  type ShiftFeature,
} from './v2Engine'
import { createLabV2Session, labV2Reducer, readLabV2Session, writeLabV2Session } from './v2Session'

const TOOL_META: Record<LabTool, { short: string; name: string }> = {
  'test-probe': { short: 'TP', name: 'TEST PROBE' },
  'class-probe': { short: 'CP', name: 'CLASS PROBE' },
  'environment-switch': { short: 'ES', name: 'ENV SWITCH' },
}

const levelTool: Record<LabLevel, LabTool> = { 1: 'test-probe', 2: 'class-probe', 3: 'environment-switch' }
const pct = (value: number) => `${Math.round(value * 100)}%`

function SignalMeter({ label, value, target = .8 }: { label: string; value: number; target?: number }) {
  const pass = value >= target
  return (
    <div className={`lab-meter ${pass ? 'pass' : 'fail'}`}>
      <div><span>{label}</span><strong>{pct(value)}</strong></div>
      <div className="lab-meter-track" aria-hidden="true"><i style={{ width: `${value * 100}%` }} /><b style={{ left: `${target * 100}%` }} /></div>
    </div>
  )
}

function ToolChip({ tool, installed, onInstall }: { tool: LabTool; installed: boolean; onInstall: (tool: LabTool) => void }) {
  const meta = TOOL_META[tool]
  return (
    <button type="button" draggable={!installed} className={`lab-tool-chip ${installed ? 'installed' : ''}`}
      onDragStart={(event) => event.dataTransfer.setData('text/plain', tool)} onClick={() => onInstall(tool)} disabled={installed}
      aria-label={`${meta.name}${installed ? ' 已安装' : '，点击或拖入工作台'}`}>
      <b>{meta.short}</b><span><strong>{meta.name}</strong><small>{installed ? 'ONLINE' : 'DRAG / CLICK TO INSTALL'}</small></span>
    </button>
  )
}

function ProbeBay({ tools, onInstall }: { tools: readonly LabTool[]; onInstall: (tool: LabTool) => void }) {
  const acceptDrop = (raw: string) => {
    if (raw === 'test-probe' || raw === 'class-probe' || raw === 'environment-switch') onInstall(raw)
  }
  return (
    <div className="lab-probe-bay" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptDrop(event.dataTransfer.getData('text/plain')) }} aria-label="实验工具安装槽">
      {(['environment-switch', 'test-probe', 'class-probe'] as const).map((tool) => {
        const installed = tools.includes(tool)
        return <div key={tool} className={`lab-probe-slot ${installed ? 'online' : ''}`}><small>{TOOL_META[tool].short}</small><strong>{installed ? TOOL_META[tool].name : 'EMPTY SLOT'}</strong></div>
      })}
    </div>
  )
}

function LevelOneControls({ feature, enabled, onChange }: { feature: LevelOneFeature; enabled: boolean; onChange: (feature: LevelOneFeature) => void }) {
  return <div className="lab-control-block" aria-label="特征总线">
    <div className="lab-node-label"><small>FEATURE BUS</small><strong>选择送进分类器的信号</strong></div>
    {!enabled && <span className="lab-control-lock">CONTROL LOCKED · INSTALL TEST PROBE</span>}
    <div className="lab-switch-grid">{(Object.keys(levelOneFeatureLabels) as LevelOneFeature[]).map((item) => <button type="button" key={item} disabled={!enabled} className={feature === item ? 'active' : ''} onClick={() => onChange(item)}><i />{levelOneFeatureLabels[item]}</button>)}</div>
  </div>
}

function LevelTwoControls({ threshold, classProbe, onChange }: { threshold: number; classProbe: boolean; onChange: (threshold: number) => void }) {
  const metrics = evaluateScreening(threshold)
  return <div className="lab-control-block threshold" aria-label="分类阈值控制器">
    <div className="lab-node-label"><small>DECISION THRESHOLD</small><strong>{threshold.toFixed(2)}</strong></div>
    {!classProbe && <span className="lab-control-lock">CONTROL LOCKED · INSTALL CLASS PROBE</span>}
    <input aria-label="风险阈值" disabled={!classProbe} type="range" min="0.35" max="0.85" step="0.01" value={threshold} onChange={(event) => onChange(Number(event.target.value))} />
    <div className="lab-score-rail" aria-label="病例风险分数分布">
      <span className="lab-threshold-line" style={{ left: `${((threshold - .03) / .91) * 100}%` }} />
      {screeningScoreRail.map((sample, index) => <i key={sample.id} className={sample.urgent ? 'urgent' : 'normal'} style={{ left: `${((sample.score - .03) / .91) * 100}%`, top: `${7 + (index % 4) * 8}px` }} title={`${sample.urgent ? '优先病例' : '普通病例'} ${sample.score.toFixed(2)}`} />)}
    </div>
    <div className="lab-rail-legend"><span><i className="urgent" />优先病例</span><span><i className="normal" />普通病例</span>{classProbe && <b>{metrics.missedUrgent}/4 漏诊</b>}</div>
  </div>
}

function LevelThreeControls({ feature, environment, envEnabled, onFeature, onEnvironment }: { feature: ShiftFeature; environment: ShiftEnvironment; envEnabled: boolean; onFeature: (feature: ShiftFeature) => void; onEnvironment: (environment: ShiftEnvironment) => void }) {
  const day = evaluateShift(feature, 'day')
  const night = evaluateShift(feature, 'night')
  return <>
    <div className="lab-control-block" aria-label="环境输入"><div className="lab-node-label"><small>DATA ENVIRONMENT</small><strong>{envEnabled ? environment.toUpperCase() : 'DAY · LOCKED'}</strong></div>
      <div className="lab-toggle-row">{(['day', 'night'] as const).map((item) => <button type="button" key={item} disabled={!envEnabled} className={environment === item && envEnabled ? 'active' : ''} onClick={() => onEnvironment(item)}>{item.toUpperCase()}</button>)}</div>
    </div>
    <div className="lab-control-block" aria-label="观察通道"><div className="lab-node-label"><small>FEATURE BUS</small><strong>固定模型，只换输入信号</strong></div>
      {!envEnabled && <span className="lab-control-lock">CONTROL LOCKED · INSTALL ENV SWITCH</span>}
      <div className="lab-switch-grid three">{(Object.keys(shiftFeatureLabels) as ShiftFeature[]).map((item) => <button type="button" key={item} disabled={!envEnabled} className={feature === item ? 'active' : ''} onClick={() => onFeature(item)}>{shiftFeatureLabels[item]}</button>)}</div>
      {envEnabled && <div className="lab-mini-compare"><span>DAY <b>{pct(day.accuracy)}</b></span><span>NIGHT <b>{pct(night.accuracy)}</b></span></div>}
    </div>
  </>
}

function LiveScope({ level, featureOne, threshold, shiftFeature, environment, testProbe, classProbe }: { level: LabLevel; featureOne: LevelOneFeature; threshold: number; shiftFeature: ShiftFeature; environment: ShiftEnvironment; testProbe: boolean; classProbe: boolean }) {
  if (level === 1) {
    const result = evaluateLevelOne(featureOne)
    return <div className="lab-live-scope" aria-label="实时仪表"><SignalMeter label="TRAIN" value={result.train} />{testProbe ? <SignalMeter label="UNKNOWN" value={result.field} /> : <div className="lab-meter blind"><span>UNKNOWN CHANNEL</span><strong>NO PROBE</strong></div>}</div>
  }
  if (level === 2) {
    const result = evaluateScreening(threshold)
    return <div className="lab-live-scope" aria-label="实时仪表"><SignalMeter label="ACCURACY" value={result.accuracy} />{classProbe ? <SignalMeter label="PRIORITY RECALL" value={result.urgentRecall} target={.75} /> : <div className="lab-meter blind"><span>CLASS CHANNEL</span><strong>NO PROBE</strong></div>}</div>
  }
  const result = evaluateShift(shiftFeature, environment)
  return <div className="lab-live-scope" aria-label="实时仪表"><SignalMeter label={`${environment.toUpperCase()} ACC`} value={result.accuracy} />{classProbe ? <SignalMeter label="MIN RECALL" value={result.minRecall} target={.75} /> : null}</div>
}

export function LabV2() {
  const [session, dispatch] = useReducer(labV2Reducer, undefined, () => typeof window === 'undefined' ? createLabV2Session() : readLabV2Session(window.localStorage))
  const definition = LAB_LEVELS[session.level - 1]
  const currentTool = levelTool[session.level]
  const currentToolUnlocked = session.unlockedTools.includes(currentTool)
  const currentLevelComplete = session.completedLevels.includes(session.level)
  const classProbeInstalled = session.installedTools.includes('class-probe')
  const testProbeInstalled = session.installedTools.includes('test-probe')
  const envSwitchInstalled = session.installedTools.includes('environment-switch')

  useEffect(() => { writeLabV2Session(window.localStorage, session) }, [session])
  const installedLabels = useMemo(() => session.installedTools.map((tool) => TOOL_META[tool].name), [session.installedTools])
  const installTool = (tool: LabTool) => dispatch({ type: 'install-tool', tool })
  const nextLevel = Math.min(3, session.level + 1) as LabLevel

  return <main className="lab-v2-shell" aria-label="AI系统实验室 V2">
    <header className="lab-v2-header">
      <div className="lab-v2-brand"><b>AIA</b><span><strong>AI SYSTEM LAB</strong><small>V2 / BUILD · RUN · BREAK · FIX</small></span></div>
      <nav aria-label="实验关卡">{LAB_LEVELS.map((level) => { const unlocked = level.id <= session.unlockedLevel; const done = session.completedLevels.includes(level.id); return <button type="button" key={level.id} disabled={!unlocked} className={session.level === level.id ? 'active' : done ? 'done' : ''} onClick={() => dispatch({ type: 'go-level', level: level.id })}><small>{level.code}</small><strong>{done ? '✓' : level.id}</strong></button> })}</nav>
      <div className="lab-v2-actions"><button type="button" onClick={() => dispatch({ type: 'reset' })}>RESET LAB</button><button type="button" onClick={() => { window.location.href = '?legacy=1' }}>LEGACY</button></div>
    </header>

    <section className="lab-mission-strip" aria-label="当前实验目标"><div><small>{definition.code} / OBJECTIVE</small><h1>{definition.title}</h1></div><p>{definition.objective}</p><div className="lab-mission-rule"><span>PASS LINE</span><strong>{session.level === 2 ? 'ACC ≥80 · RECALL ≥75' : session.level === 3 ? 'DAY + NIGHT ≥80' : 'UNKNOWN ≥80'}</strong></div></section>

    <div className="lab-v2-layout">
      <aside className="lab-tool-shelf" aria-label="实验工具架"><div className="lab-panel-title"><small>TOOL SHELF</small><strong>本关新原语</strong></div>
        {!currentToolUnlocked ? <div className="lab-locked-tool"><b>?</b><span><strong>UNKNOWN MODULE</strong><small>先运行当前系统，让故障自己暴露。</small></span></div> : <ToolChip tool={currentTool} installed={session.installedTools.includes(currentTool)} onInstall={installTool} />}
        <div className="lab-inherited-tools"><small>INSTALLED / INHERITED</small>{installedLabels.length ? installedLabels.map((label) => <span key={label}>● {label}</span>) : <span>— no probes online —</span>}</div>
        <div className="lab-shelf-rule"><small>规则</small><p>不提交“答案”。改工作台，然后运行它。</p></div>
      </aside>

      <section className="lab-workbench" aria-label="AI实验工作台"><div className="lab-panel-title bench"><small>WORKBENCH</small><strong>信号路径</strong><span>RUN #{String(session.runCount).padStart(2, '0')}</span></div>
        <div className="lab-pipeline" aria-label="可操作系统管线">
          <article className="lab-pipeline-node"><small>01 / DATA</small><strong>{session.level === 2 ? '54 CASES' : session.level === 3 ? (envSwitchInstalled ? session.environment.toUpperCase() : 'DAY FEED') : 'CAT / BREAD'}</strong><i className="lab-port out" /></article><div className="lab-wire"><i /></div>
          <article className="lab-pipeline-node"><small>02 / FEATURE</small><strong>{session.level === 1 ? levelOneFeatureLabels[session.levelOneFeature] : session.level === 2 ? 'RISK SCORE' : shiftFeatureLabels[session.shiftFeature]}</strong><i className="lab-port in" /><i className="lab-port out" /></article><div className="lab-wire"><i /></div>
          <article className="lab-pipeline-node"><small>03 / CLASSIFIER</small><strong>{session.level === 2 ? `THRESHOLD ${session.threshold.toFixed(2)}` : 'FIXED SIMPLE MODEL'}</strong><i className="lab-port in" /><i className="lab-port out" /></article><div className="lab-wire"><i /></div>
          <article className="lab-pipeline-node gate"><small>04 / FIELD GATE</small><strong>RUN TESTS</strong><i className="lab-port in" /></article>
        </div>
        <ProbeBay tools={session.installedTools} onInstall={installTool} />
        <div className="lab-control-deck">
          {session.level === 1 && <LevelOneControls feature={session.levelOneFeature} enabled={testProbeInstalled} onChange={(feature) => dispatch({ type: 'set-level-one-feature', feature })} />}
          {session.level === 2 && <LevelTwoControls threshold={session.threshold} classProbe={classProbeInstalled} onChange={(threshold) => dispatch({ type: 'set-threshold', threshold })} />}
          {session.level === 3 && <LevelThreeControls feature={session.shiftFeature} environment={session.environment} envEnabled={envSwitchInstalled} onFeature={(feature) => dispatch({ type: 'set-shift-feature', feature })} onEnvironment={(environment) => dispatch({ type: 'set-environment', environment })} />}
        </div>
        <button type="button" className="lab-run-button" onClick={() => dispatch({ type: 'run' })}><span>▶</span><strong>{session.level === 1 ? 'SHIP / RUN FIELD GATE' : 'RUN TESTS'}</strong><small>执行当前工作台配置</small></button>
      </section>

      <aside className="lab-output-panel" aria-label="实验输出"><div className="lab-panel-title"><small>LIVE OUTPUT</small><strong>系统行为</strong></div>
        <LiveScope level={session.level} featureOne={session.levelOneFeature} threshold={session.threshold} shiftFeature={session.shiftFeature} environment={session.environment} testProbe={testProbeInstalled} classProbe={classProbeInstalled} />
        <section className={`lab-run-report ${session.lastRun ? session.lastRun.passed ? 'pass' : 'fail' : 'idle'}`} aria-label="最近一次运行结果">{!session.lastRun ? <><small>WAITING</small><strong>还没有运行</strong><p>先动工作台，再按 RUN。</p></> : <><small>{session.lastRun.passed ? 'TESTS PASSED' : 'TESTS NOT PASSED'}</small><strong>{session.lastRun.headline}</strong><div className="lab-report-values">{session.lastRun.values.map((item) => <span key={item.label} className={item.pass === undefined ? '' : item.pass ? 'pass' : 'fail'}><small>{item.label}</small><b>{item.value}</b></span>)}</div><p>{session.lastRun.detail}</p></>}</section>
        {session.level === 3 && envSwitchInstalled && <div className="lab-controlled-record" aria-label="跨环境记录"><small>CONTROLLED RECORD</small><span className={session.shiftPasses.day ? 'pass' : ''}>DAY {session.shiftPasses.day ? `✓ ${shiftFeatureLabels[session.shiftPasses.day]}` : '—'}</span><span className={session.shiftPasses.night ? 'pass' : ''}>NIGHT {session.shiftPasses.night ? `✓ ${shiftFeatureLabels[session.shiftPasses.night]}` : '—'}</span></div>}
        {currentLevelComplete && <section className="lab-level-clear" aria-label={`${definition.code} 已通过`}><small>PRIMITIVE INTERNALIZED</small><strong>{definition.term}</strong><p>术语现在才出现：你已经先用操作把它做出来了。</p>{session.level < 3 ? <button type="button" onClick={() => dispatch({ type: 'go-level', level: nextLevel })}>NEXT LEVEL →</button> : <div className="lab-prototype-done"><b>VERTICAL SLICE COMPLETE</b><span>3 个原语已连续复用。下一步再决定是否迁移 CASE 004/005。</span></div>}</section>}
      </aside>
    </div>
  </main>
}
