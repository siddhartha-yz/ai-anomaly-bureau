import { useEffect, useMemo, useRef, useState } from 'react'
import { formalCaseCode } from '../bureau/catalog'
import type { InvestigationGrade } from '../bureau/progress'
import type { AuthoredPuzzleConfig } from './authoredCasePuzzles'
import { clearPuzzleSession, puzzleSessionHasProgress, readPuzzleSession, writePuzzleSession, type PuzzleSession } from './puzzleSession'

export function puzzleCaseScore(mistakes: number) {
  // Authored cases are investigation puzzles, not answer-key quizzes. One
  // evidence-driven revision should still earn an S: falsifying a plausible
  // hypothesis is part of the intended loop. Repeated misses still cost enough
  // to make blind option cycling a poor route to a high grade.
  const revisionPenalty = mistakes === 0 ? 0 : 4 + Math.max(0, mistakes - 1) * 8
  const score = Math.max(55, 100 - revisionPenalty)
  const grade: InvestigationGrade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : 'C'
  return { score, grade }
}

function createSession(config: AuthoredPuzzleConfig, seed: number): PuzzleSession {
  return {
    version: 1,
    caseId: config.definition.id as PuzzleSession['caseId'],
    seed,
    stage: 0,
    checks: 0,
    mistakes: 0,
    solved: false,
  }
}

export function StoryPuzzleRuntime({
  config,
  seed,
  onRestart,
  onReturnToBureau,
  onCaseClosed,
}: {
  config: AuthoredPuzzleConfig
  seed: number
  onRestart: () => void
  onReturnToBureau?: () => void
  onCaseClosed?: (result: { grade: InvestigationGrade; score: number }) => void
}) {
  const restored = useMemo(
    () => readPuzzleSession(window.localStorage, config, seed),
    [config, seed],
  )
  const [session, setSession] = useState<PuzzleSession>(() => restored ?? createSession(config, seed))
  const [saveFailed, setSaveFailed] = useState(false)
  const closureReported = useRef(false)
  const stage = config.stages[session.stage]
  const selected = stage.options.find((option) => option.id === session.selectedOptionId)
  const lastOption = session.lastRun?.stage === session.stage
    ? stage.options.find((option) => option.id === session.lastRun?.optionId)
    : undefined
  const passed = Boolean(session.lastRun?.stage === session.stage && session.lastRun.correct)
  const rating = puzzleCaseScore(session.mistakes)

  useEffect(() => {
    const saved = writePuzzleSession(window.localStorage, session)
    setSaveFailed(!saved)
  }, [session])

  const choose = (optionId: string) => {
    if (passed || session.solved) return
    setSession((current) => ({ ...current, selectedOptionId: optionId }))
  }

  const run = () => {
    if (!selected || passed || session.solved) return
    const correct = stage.correctIds.includes(selected.id)
    setSession((current) => ({
      ...current,
      checks: current.checks + 1,
      mistakes: current.mistakes + (correct ? 0 : 1),
      lastRun: { stage: current.stage, optionId: selected.id, correct },
    }))
  }

  const advance = () => {
    if (!passed || session.solved) return
    if (session.stage === config.stages.length - 1) {
      const solvedSession = { ...session, solved: true }
      setSession(solvedSession)
      if (!closureReported.current) {
        closureReported.current = true
        onCaseClosed?.(puzzleCaseScore(solvedSession.mistakes))
      }
      return
    }
    setSession((current) => ({
      ...current,
      stage: current.stage + 1,
      selectedOptionId: undefined,
      lastRun: undefined,
    }))
  }

  const retrySave = () => {
    setSaveFailed(!writePuzzleSession(window.localStorage, session))
  }

  const restart = () => {
    clearPuzzleSession(window.localStorage, config.definition.id as PuzzleSession['caseId'], seed)
    onRestart()
  }

  if (session.solved) {
    return (
      <main className="puzzle-case-shell solved" aria-label={`${formalCaseCode(config.definition)} 已结案`}>
        <section className="puzzle-case-closure">
          <span className="puzzle-case-kicker">CASE RESOLVED / AUTHORED INVESTIGATION</span>
          <div className="puzzle-case-stamp">{rating.grade}<small>{rating.score}/100</small></div>
          <div>
            <small>{formalCaseCode(config.definition)} · {config.definition.classification}</small>
            <h1>{config.closureTitle}</h1>
            <p>{config.closureSummary}</p>
          </div>
          <div className="puzzle-takeaways">
            {config.takeaways.map((takeaway, index) => <span key={takeaway}><b>0{index + 1}</b>{takeaway}</span>)}
          </div>
          <div className="puzzle-closure-stats">
            <span><small>PUZZLES</small><strong>{config.stages.length}/{config.stages.length}</strong></span>
            <span><small>REVISIONS</small><strong>{session.mistakes}</strong></span>
            <span><small>CHECKS</small><strong>{session.checks}</strong></span>
          </div>
          <div className="puzzle-case-actions">
            {onReturnToBureau && <button type="button" className="puzzle-primary" onClick={onReturnToBureau}>归档并返回调查局</button>}
            <button type="button" className="puzzle-secondary" onClick={restart}>重新调查本案</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="puzzle-case-shell" aria-label={`${formalCaseCode(config.definition)} 调查终端`}>
      <header className="puzzle-case-header">
        <div>
          <small>AI ANOMALY BUREAU / AUTHORED CASE</small>
          <strong>{formalCaseCode(config.definition)} · {config.definition.title}</strong>
        </div>
        <div className="puzzle-case-header-actions">
          {onReturnToBureau && <button type="button" onClick={onReturnToBureau}>返回调查局</button>}
          <button type="button" onClick={restart}>RESET</button>
        </div>
      </header>

      {saveFailed && (
        <section className="puzzle-save-warning" role="alert">
          <span>LOCAL SAVE FAILED</span>
          <p>当前浏览器没有成功写入本案检查点。你可以继续操作，但刷新前建议重试保存。</p>
          <button type="button" onClick={retrySave}>重试本地保存</button>
        </section>
      )}

      <section className="puzzle-case-brief">
        <div className="puzzle-case-icon" aria-hidden="true">{config.definition.icon[0]}<i>{config.definition.icon[1]}</i>{config.definition.icon[2]}</div>
        <div>
          <small>{config.definition.classification}</small>
          <h1>{config.definition.incident}</h1>
          <p>{config.definition.objective}</p>
        </div>
      </section>

      <section className="puzzle-progress" aria-label="案件谜题进度">
        {config.stages.map((item, index) => (
          <span key={item.id} className={index < session.stage ? 'done' : index === session.stage ? 'active' : ''}>
            <b>{String(index + 1).padStart(2, '0')}</b>{item.kicker.split(' / ').at(-1)}
          </span>
        ))}
      </section>

      <div className="puzzle-workspace">
        <section className="puzzle-main-panel">
          <div className="puzzle-stage-heading">
            <span>{stage.kicker}</span>
            <h2>{stage.title}</h2>
            <p>{stage.brief}</p>
          </div>

          {stage.evidence && (
            <section className="puzzle-evidence" aria-label={`${stage.title} 证据档案`}>
              <div className="puzzle-evidence-head">
                <small>PLAYER-READ EVIDENCE</small>
                <strong>{stage.evidence.title}</strong>
                {stage.evidence.note && <span>{stage.evidence.note}</span>}
              </div>
              <div className="puzzle-evidence-table-wrap">
                <table>
                  <thead><tr>{stage.evidence.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>
                    {stage.evidence.rows.map((row, rowIndex) => (
                      <tr key={`${stage.id}-evidence-${rowIndex}`}>
                        {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="puzzle-question">
            <small>CURRENT PUZZLE</small>
            <strong>{stage.prompt}</strong>
          </div>

          <div className="puzzle-option-grid" role="group" aria-label="可选调查动作">
            {stage.options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={session.selectedOptionId === option.id ? 'selected' : ''}
                aria-pressed={session.selectedOptionId === option.id}
                disabled={passed}
                onClick={() => choose(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>

          {!passed && (
            <button type="button" className="puzzle-run-button" disabled={!selected} onClick={run}>
              {stage.actionLabel}
            </button>
          )}

          {lastOption && session.lastRun && (
            <section className={`puzzle-result ${session.lastRun.correct ? 'success' : 'failure'}`} aria-label="本次调查结果">
              <small>{session.lastRun.correct ? 'EVIDENCE ACCEPTED' : 'HYPOTHESIS REJECTED'}</small>
              <h3>{lastOption.resultTitle}</h3>
              {lastOption.resultMetrics && (
                <div className="puzzle-metrics">
                  {lastOption.resultMetrics.map((metric) => (
                    <article key={metric.label} className={metric.pass === undefined ? '' : metric.pass ? 'pass' : 'fail'}>
                      <span>{metric.label}</span><strong>{metric.value}</strong>{metric.note && <small>{metric.note}</small>}
                    </article>
                  ))}
                </div>
              )}
              <p>{lastOption.resultNote}</p>
              {session.lastRun.correct ? (
                <><div className="puzzle-unlock">{stage.success}</div><button type="button" className="puzzle-continue" onClick={advance}>{session.stage === config.stages.length - 1 ? '封存证据并结案' : '封存证据 · 进入下一谜题'}</button></>
              ) : <span className="puzzle-retry-note">这次判断已记为一次修正。换一个方案继续，不会卡死案件。</span>}
            </section>
          )}
        </section>

        <aside className="puzzle-side-panel">
          <section><small>CASE LOCATION</small><strong>{config.definition.dispatchLocation}</strong><span>{config.definition.dispatchTime}</span></section>
          <section><small>INVESTIGATION RULE</small><strong>一关只新增一个原语</strong><p>新案件会继续复用旧案件已经建立的观察、未知审计与控制变量方法。</p></section>
          <section><small>CASE RECORD</small><strong>{session.checks} 次检查</strong><p>{session.mistakes ? `${session.mistakes} 次判断被证据推翻；首次修正仍可保留 S，连续盲试才会明显降级。` : '目前没有被证据推翻的判断。'}</p></section>
          {restored && puzzleSessionHasProgress(restored) && <section className="puzzle-restored"><small>LOCAL CHECKPOINT</small><strong>已恢复本地进度</strong><p>刷新不会把已经完成的谜题清零。</p></section>}
        </aside>
      </div>
    </main>
  )
}
