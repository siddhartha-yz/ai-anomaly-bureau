import { useEffect, useState } from 'react'
import { STAGE_CONTENT } from '../content/level1'
import { hintFor } from '../game/hints'
import type { GameState, Stage } from '../game/types'

type AssistantMood = 'idle' | 'thinking' | 'warning' | 'success'

const MOOD_BY_STAGE: Record<Stage, AssistantMood> = {
  briefing: 'idle',
  inspect_data: 'thinking',
  choose_features: 'thinking',
  choose_model: 'thinking',
  train: 'thinking',
  first_success: 'success',
  hidden_test: 'thinking',
  inspect_errors: 'warning',
  iterate: 'thinking',
  overfit_reveal: 'warning',
  final_audit: 'success',
  transfer_question: 'thinking',
  complete: 'success',
}

function XiaoxiSprite({ mood }: { mood: AssistantMood }) {
  return (
    <svg className="xiaoxi-sprite" viewBox="0 0 64 64" aria-hidden="true">
      <g shapeRendering="crispEdges" className={`xiaoxi-pixels mood-${mood}`}>
        <rect className="xiaoxi-aura" x="12" y="10" width="40" height="38" />
        <rect className="xiaoxi-aura" x="8" y="18" width="48" height="22" />
        <rect className="xiaoxi-body" x="18" y="16" width="28" height="30" />
        <rect className="xiaoxi-screen" x="20" y="22" width="24" height="14" />
        {mood === 'warning' ? (
          <>
            <rect className="xiaoxi-eye" x="25" y="26" width="4" height="2" />
            <rect className="xiaoxi-eye" x="35" y="26" width="4" height="2" />
            <rect className="xiaoxi-alert-eye" x="30" y="31" width="4" height="2" />
          </>
        ) : mood === 'success' ? (
          <>
            <rect className="xiaoxi-eye" x="24" y="27" width="3" height="2" />
            <rect className="xiaoxi-eye" x="37" y="27" width="3" height="2" />
            <rect className="xiaoxi-smile" x="28" y="31" width="8" height="2" />
          </>
        ) : (
          <>
            <rect className="xiaoxi-eye" x="25" y="27" width="4" height="3" />
            <rect className="xiaoxi-eye" x="35" y="27" width="4" height="3" />
          </>
        )}
        <rect className="xiaoxi-arm" x="12" y="34" width="6" height="12" />
        <rect className="xiaoxi-arm" x="46" y="34" width="6" height="12" />
        <rect className="xiaoxi-leg" x="22" y="46" width="7" height="8" />
        <rect className="xiaoxi-leg" x="35" y="46" width="7" height="8" />
        <rect className="xiaoxi-console" x="26" y="39" width="12" height="4" />
        <rect className="xiaoxi-antenna" x="30" y="7" width="4" height="6" />
        <rect className="xiaoxi-antenna-tip" x="29" y="5" width="6" height="4" />
      </g>
    </svg>
  )
}

export function AssistantPanel({
  state,
  onHint,
  floating = true,
  showHint = false,
}: {
  state: GameState
  onHint: () => void
  floating?: boolean
  showHint?: boolean
}) {
  const [userCollapsed, setUserCollapsed] = useState(false)
  const [autoCompact, setAutoCompact] = useState(false)
  const [forcedOpen, setForcedOpen] = useState(false)
  const collapsed = userCollapsed || (autoCompact && !forcedOpen)

  useEffect(() => {
    if (!floating) return

    const updateSafeGutter = () => {
      const workspace = document.querySelector<HTMLElement>('.game-workspace')
        ?? document.querySelector<HTMLElement>('.briefing-game-layout')
      if (!workspace) return
      const gutter = window.innerWidth - workspace.getBoundingClientRect().right
      setAutoCompact(gutter < 292)
    }

    const frame = window.requestAnimationFrame(updateSafeGutter)
    const observer = new ResizeObserver(updateSafeGutter)
    const workspace = document.querySelector<HTMLElement>('.game-workspace')
      ?? document.querySelector<HTMLElement>('.briefing-game-layout')
    if (workspace) observer.observe(workspace)
    window.addEventListener('resize', updateSafeGutter)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', updateSafeGutter)
    }
  }, [floating, state.stage])

  useEffect(() => {
    setForcedOpen(false)
  }, [state.stage])
  const message = showHint ? hintFor(state) : STAGE_CONTENT[state.stage].assistant
  const mood = MOOD_BY_STAGE[state.stage]
  const statusText = mood === 'warning' ? 'ALERT' : mood === 'thinking' ? 'ANALYZING' : mood === 'success' ? 'NICE!' : 'ONLINE'

  return (
    <aside className={`assistant-panel pixel-assistant ${floating ? 'floating-xiaoxi' : ''} assistant-${mood} ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="xiaoxi-toggle"
        onClick={() => {
          if (collapsed) {
            setUserCollapsed(false)
            setForcedOpen(true)
          } else {
            setUserCollapsed(true)
            setForcedOpen(false)
          }
        }}
        aria-label={collapsed ? '展开小析' : '收起小析'}
        aria-expanded={!collapsed}
      >
        <span className="assistant-character">
          <XiaoxiSprite mood={mood} />
          <span className="assistant-online">{statusText}</span>
        </span>
        {collapsed && <span className="xiaoxi-collapsed-label">小析</span>}
      </button>
      {!collapsed && (
        <div className="assistant-dialogue">
          <div className="assistant-title">小析 <span>// AI 调查助理</span></div>
          <p>{message}</p>
          {state.stage !== 'complete' && (
            <button type="button" className="text-button hint-command" onClick={onHint}>
              &gt; 请求{state.hintLevel === 0 ? '一级' : state.hintLevel >= 3 ? '再次' : '更具体'}提示
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
