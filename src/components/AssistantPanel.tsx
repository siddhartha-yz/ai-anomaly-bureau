import { STAGE_CONTENT } from '../content/level1'
import { hintFor } from '../game/hints'
import type { GameState } from '../game/types'

function XiaoxiSprite() {
  return (
    <svg className="xiaoxi-sprite" viewBox="0 0 64 64" aria-hidden="true">
      <g shapeRendering="crispEdges">
        <rect className="xiaoxi-aura" x="12" y="10" width="40" height="38" />
        <rect className="xiaoxi-aura" x="8" y="18" width="48" height="22" />
        <rect className="xiaoxi-body" x="18" y="16" width="28" height="30" />
        <rect className="xiaoxi-screen" x="20" y="22" width="24" height="14" />
        <rect className="xiaoxi-eye" x="25" y="27" width="4" height="3" />
        <rect className="xiaoxi-eye" x="35" y="27" width="4" height="3" />
        <rect className="xiaoxi-arm" x="12" y="34" width="6" height="12" />
        <rect className="xiaoxi-arm" x="46" y="34" width="6" height="12" />
        <rect className="xiaoxi-leg" x="22" y="46" width="7" height="8" />
        <rect className="xiaoxi-leg" x="35" y="46" width="7" height="8" />
        <rect className="xiaoxi-console" x="26" y="39" width="12" height="4" />
      </g>
    </svg>
  )
}

export function AssistantPanel({ state, onHint }: { state: GameState; onHint: () => void }) {
  const message = state.hintLevel > 0 ? hintFor(state) : STAGE_CONTENT[state.stage].assistant
  return (
    <aside className="assistant-panel pixel-assistant">
      <div className="assistant-character">
        <XiaoxiSprite />
        <span className="assistant-online">ONLINE</span>
      </div>
      <div className="assistant-dialogue">
        <div className="assistant-title">小析 <span>// AI 调查助理</span></div>
        <p>{message}</p>
        {state.stage !== 'complete' && (
          <button type="button" className="text-button hint-command" onClick={onHint}>
            &gt; 请求{state.hintLevel === 0 ? '一级' : state.hintLevel >= 3 ? '再次' : '更具体'}提示
          </button>
        )}
      </div>
    </aside>
  )
}
