import { STAGE_CONTENT } from '../content/level1'
import { hintFor } from '../game/hints'
import type { GameState } from '../game/types'

export function AssistantPanel({ state, onHint }: { state: GameState; onHint: () => void }) {
  return (
    <aside className="assistant-panel">
      <div className="assistant-avatar" aria-hidden="true">析</div>
      <div>
        <div className="assistant-title">小析 · AI 助理</div>
        <p>{state.hintLevel > 0 ? hintFor(state) : STAGE_CONTENT[state.stage].assistant}</p>
        {state.stage !== 'complete' && (
          <button type="button" className="text-button" onClick={onHint}>
            请求{state.hintLevel === 0 ? '一级' : state.hintLevel >= 3 ? '再次' : '更具体'}提示
          </button>
        )}
      </div>
    </aside>
  )
}
