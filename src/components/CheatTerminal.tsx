import { useEffect, useRef, useState } from 'react'
import { FORMAL_CASE_CATALOG, formalCaseCode, STORY_CASE_001, TRAINING_CASE_000 } from '../bureau/catalog'
import { acknowledgeBureauInduction, isBureauUnlocked, readBureauProgress, recordFormalCaseResolution, writeBureauProgress } from '../bureau/progress'
import { clearEndlessSession } from '../endless/session'
import { CHEAT_AUTO_RESUME_KEY, CHEAT_FORMAL_CASE_ID_KEY, createStoryCheatSession, parseCheatCode } from '../game/cheats'
import { clearStorySession, writeStorySession } from '../game/session'
import { beginQaSession, clearQaWorkingState, qaSnapshotSummary, readQaSnapshot, restoreQaSession, type QaSnapshot } from '../qa/testBench'
import { clearPuzzleSession } from '../story/puzzleSession'

const EXAMPLES = [
  ['CASE001 ERRORS', '跳到第一次现场翻车后的误判调查'],
  ['CASE001 OVERFIT', '跳到 k=1 过拟合证据已经出现'],
  ['CASE001 REPAIR', '跳到备用传感器已解锁的修复阶段'],
  ['CASE001 FINAL', '跳到最终未知审计已通过'],
  ['CASE001 CLOSED', '直接打开完整合法的结案状态'],
  ['CASE002', '打开“被平均数藏起来的人”完整手工谜题'],
  ['CASE003', '打开“只在白天正确”完整手工谜题'],
  ['CASE004', '打开“验证集见过你”完整手工谜题'],
  ['BUREAU UNLOCK', '本地授予调查局权限并进入办公室'],
  ['TRAINING', `打开训练案件 ${TRAINING_CASE_000.number}`],
  ['DUTY 6003', '以指定 seed 打开一宗全新的值班案件'],
] as const

const QA_PRESETS = [
  ['CASE001 START', 'CASE 001 · 从头', '清掉本 seed Story checkpoint，走真实新人入口'],
  ['CASE001 ERRORS', 'CASE 001 · 误判调查', '直接进入第一次现场翻车后的证据阶段'],
  ['CASE001 OVERFIT', 'CASE 001 · 过拟合', 'k=1 的合法实验历史已经重建'],
  ['CASE001 REPAIR', 'CASE 001 · 修复', '备用传感器已通过正式剧情解锁'],
  ['CASE001 FINAL', 'CASE 001 · 最终审计', '修复方案已经通过正式未知审计'],
  ['CASE001 CLOSED', 'CASE 001 · 结案', '打开合法 CASE CLOSED 案卷'],
  ['CASE002', 'CASE 002 · 指标谜题', '从头测试分类别召回与多解阈值约束'],
  ['CASE003', 'CASE 003 · 环境谜题', '从头测试白天 / 夜班分布变化与稳定观察通道'],
  ['CASE004', 'CASE 004 · 泄漏谜题', '从头测试验证身份重叠、分组切分与真正泛化'],
  ['BUREAU UNLOCK', '调查局 Hub', '创建合法入职事实并打开办公室'],
  ['TRAINING', 'TRAINING 000', '直接进入训练中心案件'],
  ['DUTY 6000', 'DUTY · Feature gap', '全新 seed 6000，不恢复旧 Duty session'],
  ['DUTY 6117', 'DUTY · Overfit', '三段推理代表 seed：区分 ≠ 已修好'],
  ['DUTY 6006', 'DUTY · Shift', '因果排除代表 seed：先削弱错误解释'],
  ['DUTY 6003', 'DUTY · Imbalance', '总体分数会掩盖少数类召回'],
] as const

function currentSeed() {
  const value = Number(new URLSearchParams(window.location.search).get('seed'))
  return Number.isSafeInteger(value) && value > 0 ? value : 20260809
}

function navigate(search: string) {
  window.location.search = search
}

export function CheatTerminal() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [dutySeed, setDutySeed] = useState(() => String(currentSeed()))
  const [message, setMessage] = useState('输入 HELP 可查看命令。测试命令会先自动保护当前游戏存档。')
  const [error, setError] = useState(false)
  const [qaSnapshot, setQaSnapshot] = useState<QaSnapshot | undefined>(() => readQaSnapshot(window.localStorage))
  const inputRef = useRef<HTMLInputElement>(null)
  const explicitQaLauncher = new URLSearchParams(window.location.search).get('qa') === '1'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
      const toggle = (!typing && event.code === 'Backquote') || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k')
      if (toggle) {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }
      if (open && event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQaSnapshot(readQaSnapshot(window.localStorage))
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const ensureQaSession = () => {
    const snapshot = beginQaSession(
      window.localStorage,
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    )
    if (!snapshot) {
      setError(true)
      setMessage('无法创建 QA 存档快照；为避免覆盖你的正常进度，本次跳转已取消。')
      return false
    }
    setQaSnapshot(snapshot)
    return true
  }

  const executeCode = (raw: string) => {
    const parsed = parseCheatCode(raw)
    if (!parsed.ok) {
      setError(true)
      setMessage(parsed.message)
      return
    }
    setError(false)
    const instruction = parsed.instruction
    if (instruction.kind === 'help') {
      setMessage('可用：CASE001 ERRORS / OVERFIT / REPAIR / FINAL / CLOSED；CASE002；CASE003；CASE004；BUREAU UNLOCK；TRAINING；DUTY <seed>。')
      return
    }

    if (instruction.kind === 'story') {
      const seed = instruction.seed ?? currentSeed()
      const checkpoint = createStoryCheatSession(instruction.target, seed)
      if (!writeStorySession(window.localStorage, checkpoint)) {
        setError(true)
        setMessage('无法写入 Story 作弊检查点；浏览器 localStorage 可能不可用。')
        return
      }
      window.sessionStorage.setItem(CHEAT_AUTO_RESUME_KEY, String(seed))
      navigate(`?mode=story&seed=${seed}`)
      return
    }

    if (instruction.kind === 'story-reset') {
      const seed = instruction.seed ?? currentSeed()
      clearStorySession(window.localStorage, seed)
      window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
      navigate(`?mode=story&seed=${seed}`)
      return
    }

    if (instruction.kind === 'authored-case') {
      const seed = currentSeed()
      const definition = FORMAL_CASE_CATALOG.find((item) => item.id === instruction.caseId)
      if (!definition || definition.id === STORY_CASE_001.id) {
        setError(true)
        setMessage('无法识别手工案件入口。')
        return
      }
      clearPuzzleSession(window.localStorage, definition.id, seed)
      let progress = readBureauProgress(window.localStorage)
      // QA authored-case jumps materialize only the prerequisite closure facts.
      // This stays catalog-driven so future authored cases do not need another bespoke branch.
      for (const candidate of FORMAL_CASE_CATALOG) {
        if (candidate.id === definition.id) break
        progress = recordFormalCaseResolution(progress, candidate.id, 'S', 100)
      }
      progress = acknowledgeBureauInduction(progress)
      if (!writeBureauProgress(window.localStorage, progress)) {
        setError(true)
        setMessage(`无法准备 ${formalCaseCode(definition)} 的前置调查进度。`)
        return
      }
      window.sessionStorage.setItem(CHEAT_FORMAL_CASE_ID_KEY, definition.id)
      window.sessionStorage.setItem(CHEAT_AUTO_RESUME_KEY, String(seed))
      navigate(`?mode=story&seed=${seed}`)
      return
    }

    if (instruction.kind === 'bureau-unlock') {
      const seed = currentSeed()
      const closedStory = createStoryCheatSession('closed', seed)
      if (!writeStorySession(window.localStorage, closedStory)) {
        setError(true)
        setMessage(`无法写入 ${formalCaseCode(STORY_CASE_001)} 结案检查点。`)
        return
      }
      let progress = readBureauProgress(window.localStorage)
      // Canonical cheat path has two correct preregistered predictions and one
      // evidence-triggered hint level, yielding a coherent A · 100 report.
      progress = recordFormalCaseResolution(progress, STORY_CASE_001.id, 'A', 100)
      progress = acknowledgeBureauInduction(progress)
      if (!writeBureauProgress(window.localStorage, progress)) {
        setError(true)
        setMessage('无法写入 Bureau 本地进度。')
        return
      }
      navigate(`?mode=hub&seed=${seed}`)
      return
    }

    if (instruction.kind === 'bureau') {
      const progress = readBureauProgress(window.localStorage)
      if (!isBureauUnlocked(progress)) {
        setError(true)
        setMessage('调查局尚未解锁。测试时可输入 BUREAU UNLOCK。')
        return
      }
      navigate(`?mode=hub&seed=${currentSeed()}`)
      return
    }

    if (instruction.kind === 'training') {
      navigate(`?mode=boot&seed=${currentSeed()}`)
      return
    }

    clearEndlessSession(window.localStorage, instruction.seed)
    navigate(`?mode=endless&seed=${instruction.seed}`)
  }

  const execute = () => {
    const parsed = parseCheatCode(code)
    if (parsed.ok && parsed.instruction.kind !== 'help' && !ensureQaSession()) return
    executeCode(code)
  }

  const executeQaPreset = (raw: string) => {
    if (!ensureQaSession()) return
    setCode(raw)
    executeCode(raw)
  }

  const restoreQa = () => {
    const result = restoreQaSession(window.localStorage)
    if (!result.ok || !result.returnPath) {
      setError(true)
      setMessage('原存档恢复失败；QA 快照仍会保留，请不要继续覆盖，稍后可以再次尝试恢复。')
      return
    }
    window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
    window.sessionStorage.removeItem(CHEAT_FORMAL_CASE_ID_KEY)
    setQaSnapshot(undefined)
    window.location.assign(result.returnPath)
  }

  const startFreshQaBrowser = () => {
    if (!ensureQaSession()) return
    if (!clearQaWorkingState(window.localStorage)) {
      setError(true)
      setMessage('无法清空测试沙盒；原存档快照仍安全保留，本次操作已停止。')
      return
    }
    window.sessionStorage.removeItem(CHEAT_AUTO_RESUME_KEY)
    window.sessionStorage.removeItem(CHEAT_FORMAL_CASE_ID_KEY)
    navigate('?seed=20260809')
  }

  if (!open) {
    if (!qaSnapshot && !explicitQaLauncher) return null
    return (
      <button type="button" className={`qa-session-badge ${qaSnapshot ? 'active' : 'idle'}`} onClick={() => setOpen(true)} aria-label="打开 QA 测试工作台">
        <small>{qaSnapshot ? 'QA TEST' : 'QA BENCH'}</small><strong>{qaSnapshot ? 'SAVE SAFE' : 'OPEN'}</strong><span>{qaSnapshot ? '点击恢复 / 跳转' : '测试入口 · 普通玩家隐藏'}</span>
      </button>
    )
  }

  const qaSummary = qaSnapshotSummary(qaSnapshot)

  return (
    <div className="cheat-terminal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false)
    }}>
      <section className="cheat-terminal" role="dialog" aria-modal="true" aria-label="作弊码终端">
        <header>
          <div><small>FIELD TERMINAL // LOCAL ONLY</small><strong>作弊码终端</strong></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭作弊码终端">×</button>
        </header>
        <p>这不是另一套 Debug 模式。除 HELP 外，测试命令会先自动备份当前游戏存档，再生成合法正式 checkpoint 或打开正式模式；刷新、继续调查和后续校验全部走游戏原流程。</p>
        <section className={`qa-test-bench ${qaSnapshot ? 'active' : ''}`} aria-label="QA 测试工作台">
          <div className="qa-test-bench-head">
            <div><small>QA TEST BENCH</small><strong>{qaSnapshot ? '安全测试会话进行中' : '一键跳转，不污染正常存档'}</strong></div>
            {qaSummary && <span>{qaSummary.savedKeys} 个正式存档已备份</span>}
          </div>
          <p>{qaSnapshot
            ? `原存档已冻结在本地快照。可以继续跳关、清档、换 seed；结束时会恢复到 ${qaSummary?.returnPath ?? '原页面'}。`
            : '点击下面任意快速入口会先自动备份当前所有游戏存档，再使用正式 checkpoint / runtime 跳转。测试完可一键恢复。'}</p>
          <div className="qa-test-bench-actions">
            {qaSnapshot ? (
              <button type="button" className="qa-restore" onClick={restoreQa}>↶ 恢复原存档并结束测试</button>
            ) : (
              <button type="button" className="qa-protect" onClick={() => {
                if (ensureQaSession()) {
                  setError(false)
                  setMessage('QA 安全快照已建立。现在可以自由测试；右下角会持续显示 SAVE SAFE。')
                }
              }}>▣ 先备份当前存档</button>
            )}
            <button type="button" className="qa-fresh" onClick={startFreshQaBrowser}>全新用户状态</button>
          </div>
          <div className="qa-duty-seed-jump">
            <label htmlFor="qa-duty-seed"><small>任意 DUTY SEED</small><span>输入程序化案件 seed，不需要记命令格式。</span></label>
            <input
              id="qa-duty-seed"
              type="number"
              min="1"
              step="1"
              value={dutySeed}
              onChange={(event) => setDutySeed(event.target.value)}
            />
            <button
              type="button"
              disabled={!Number.isSafeInteger(Number(dutySeed)) || Number(dutySeed) <= 0}
              onClick={() => executeQaPreset(`DUTY ${Number(dutySeed)}`)}
            >打开指定 Duty</button>
          </div>
          <div className="qa-preset-grid">
            {QA_PRESETS.map(([value, label, description]) => (
              <button type="button" key={value} onClick={() => executeQaPreset(value)}>
                <strong>{label}</strong><small>{description}</small><code>{value}</code>
              </button>
            ))}
          </div>
        </section>
        <form onSubmit={(event) => { event.preventDefault(); execute() }}>
          <label htmlFor="cheat-code">ACCESS CODE</label>
          <div className="cheat-terminal-input-row">
            <span>›</span>
            <input
              ref={inputRef}
              id="cheat-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="CASE001 OVERFIT"
            />
            <button type="submit">执行</button>
          </div>
        </form>
        <div className={`cheat-terminal-message ${error ? 'error' : ''}`} role="status">{message}</div>
        <details>
          <summary>常用测试码</summary>
          <div className="cheat-terminal-codes">
            {EXAMPLES.map(([value, description]) => (
              <button type="button" key={value} onClick={() => { setCode(value); setError(false); setMessage(description) }}>
                <code>{value}</code><span>{description}</span>
              </button>
            ))}
          </div>
        </details>
        <footer><span>`</span> 或 <span>Ctrl + Shift + K</span> 打开 · <span>Esc</span> 关闭</footer>
      </section>
    </div>
  )
}
