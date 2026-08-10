import { useEffect, useRef, useState } from 'react'
import { acknowledgeBureauInduction, readBureauProgress, recordStory001Resolution, writeBureauProgress } from '../bureau/progress'
import { clearEndlessSession } from '../endless/session'
import { CHEAT_AUTO_RESUME_KEY, createStoryCheatSession, parseCheatCode } from '../game/cheats'
import { clearStorySession, writeStorySession } from '../game/session'

const EXAMPLES = [
  ['CASE001 ERRORS', '跳到第一次现场翻车后的误判调查'],
  ['CASE001 OVERFIT', '跳到 k=1 过拟合证据已经出现'],
  ['CASE001 REPAIR', '跳到备用传感器已解锁的修复阶段'],
  ['CASE001 FINAL', '跳到最终未知审计已通过'],
  ['CASE001 CLOSED', '直接打开完整合法的结案状态'],
  ['BUREAU UNLOCK', '本地授予调查局权限并进入办公室'],
  ['TRAINING', '打开训练案件 000'],
  ['DUTY 6003', '以指定 seed 打开一宗全新的值班案件'],
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
  const [message, setMessage] = useState('输入 HELP 可查看命令。作弊只修改当前浏览器的本地进度。')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const execute = () => {
    const parsed = parseCheatCode(code)
    if (!parsed.ok) {
      setError(true)
      setMessage(parsed.message)
      return
    }
    setError(false)
    const instruction = parsed.instruction
    if (instruction.kind === 'help') {
      setMessage('可用：CASE001 ERRORS / OVERFIT / REPAIR / FINAL / CLOSED；BUREAU UNLOCK；TRAINING；DUTY <seed>。')
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

    if (instruction.kind === 'bureau-unlock') {
      const seed = currentSeed()
      const closedStory = createStoryCheatSession('closed', seed)
      if (!writeStorySession(window.localStorage, closedStory)) {
        setError(true)
        setMessage('无法写入 CASE 001 结案检查点。')
        return
      }
      let progress = readBureauProgress(window.localStorage)
      // Canonical cheat path has two correct preregistered predictions and one
      // evidence-triggered hint level, yielding a coherent A · 100 report.
      progress = recordStory001Resolution(progress, 'A', 100)
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
      if (!progress.story001.resolved) {
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

  if (!open) return null

  return (
    <div className="cheat-terminal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false)
    }}>
      <section className="cheat-terminal" role="dialog" aria-modal="true" aria-label="作弊码终端">
        <header>
          <div><small>FIELD TERMINAL // LOCAL ONLY</small><strong>作弊码终端</strong></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭作弊码终端">×</button>
        </header>
        <p>这不是另一套 Debug 模式。命令会生成合法正式存档或打开正式模式；刷新、继续调查和后续校验全部走游戏原流程。</p>
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
