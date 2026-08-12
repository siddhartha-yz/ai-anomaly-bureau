import { useState } from 'react'
import { formalCaseCode, type FormalCaseDefinition } from '../bureau/catalog'
import type { FormalCaseResumeSummary } from '../story/registry'

export function FormalCaseResume({ definition, summary, onContinue, onDiscard, onEndless }: {
  definition: FormalCaseDefinition
  summary: FormalCaseResumeSummary
  onContinue: () => void
  onDiscard: () => void
  onEndless?: () => void
}) {
  const [discardArmed, setDiscardArmed] = useState(false)

  return (
    <main className="story-resume-shell" aria-label="已保存剧情案件">
      <section className="story-resume-card">
        <span className="story-resume-kicker">{summary.solved ? 'RESOLVED CASE SAVED' : 'UNFINISHED CASE SAVED'}</span>
        <div className="story-resume-title-row">
          <span className="story-resume-case-id">{formalCaseCode(definition)}</span>
          <div>
            <h1>{summary.solved ? '上次调查已经结案。' : '上次调查还没有结束。'}</h1>
            <p>{summary.solved
              ? '结案案卷仍保存在这台浏览器。你可以重新打开结果，也可以清除后从头调查。'
              : summary.activityLabel === 'CHECKS'
                ? '本地检查点保存了已经完成的谜题、检查次数与修正记录。继续会回到同一调查步骤。'
                : '本地检查点保存了你已经揭示的证据、实验记录和匿名行为日志。继续不会返还正式审计额度。'}</p>
          </div>
        </div>

        <div className="story-resume-stats" aria-label="剧情案件存档摘要">
          <span><small>CURRENT STEP</small><strong>{summary.stageLabel}</strong></span>
          <span><small>{summary.activityLabel ?? 'EXPERIMENTS'}</small><strong>{summary.experimentCount}</strong></span>
          <span><small>{summary.resourceLabel ?? 'AUDITS LEFT'}</small><strong>{summary.remainingCredits}</strong></span>
        </div>

        <div className="story-resume-actions">
          <button type="button" className="story-resume-primary" onClick={onContinue}>
            <small>{summary.solved ? 'OPEN DOSSIER' : 'RESUME CASE'}</small>
            <strong>{summary.solved ? '查看上次结案' : '继续上次调查'}</strong>
          </button>
          <button
            type="button"
            className={`story-resume-discard ${discardArmed ? 'armed' : ''}`}
            onClick={() => {
              if (!discardArmed) {
                setDiscardArmed(true)
                return
              }
              onDiscard()
            }}
          >
            {discardArmed ? '再次点击：清除旧进度并重新开始' : `放弃旧进度并重新开始 ${formalCaseCode(definition)}`}
          </button>
          {onEndless && <button type="button" className="story-resume-endless" onClick={onEndless}>暂不继续 · 进入无尽调查</button>}
        </div>

        <p className="story-resume-local-note">LOCAL ONLY // 存档只留在当前浏览器，不上传账号或服务器。</p>
      </section>
    </main>
  )
}
