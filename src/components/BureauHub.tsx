import { Fragment } from 'react'
import { FORMAL_CASE_CATALOG, formalCaseCode, STORY_CASE_001, TRAINING_CASE_CATALOG, trainingCaseCode, type FormalCaseId, type TrainingCaseId } from '../bureau/catalog'
import { bureauDispatch, type BureauDepartment } from '../bureau/dispatch'
import { createDutyCasePreview, type DutyResumeSummary } from '../bureau/duty'
import { bureauArchive, formalCaseProgress, investigatorStatus, isBureauUnlocked, isFormalCaseAvailable, nextDutySeeds, trainingCaseProgress, type BureauProgress, type DutyResolution } from '../bureau/progress'
import type { FormalCaseResumeSummary } from '../story/registry'

export type HubSection = BureauDepartment

const SECTION_META: Record<HubSection, { code: string; label: string; description: string }> = {
  'case-board': { code: 'CASE BOARD', label: '案件板', description: '接收正式案件，查看结案与当前分派。' },
  training: { code: 'TRAINING', label: '训练中心', description: '练调查方法，不消耗正式案件记录。' },
  archive: { code: 'ARCHIVE', label: '调查档案', description: '只记录你亲手发现过的模型故障与调查方法。' },
  duty: { code: 'DUTY DESK', label: '值班室', description: '处理程序化异常报告，把方法用在陌生案件上。' },
}

type DutySyndrome = DutyResolution['syndrome']

const PATHOLOGY_LABEL: Record<DutySyndrome, string> = {
  'feature-gap': '观察信息不足',
  'overfit-noise': '训练噪声 / 过拟合',
  'distribution-shift': '分布变化',
  'class-imbalance': '类别不平衡',
}

function StatusPill({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'yellow' | 'muted' }) {
  return <span className={`bureau-status-pill ${tone}`}>{children}</span>
}

export function BureauHub({
  section,
  progress,
  formalCaseResumes,
  endlessResume,
  dutySeed,
  onOpenFormalCase,
  onTraining,
  onDuty,
  onAcknowledgeInduction,
  onSectionChange,
}: {
  section: HubSection
  progress: BureauProgress
  formalCaseResumes?: Partial<Record<FormalCaseId, FormalCaseResumeSummary>>
  endlessResume?: DutyResumeSummary
  dutySeed: number
  onOpenFormalCase: (caseId: FormalCaseId) => void
  onTraining: (caseId: TrainingCaseId) => void
  onDuty: (seed: number) => void
  onAcknowledgeInduction: () => void
  onSectionChange: (section: HubSection) => void
}) {
  const status = investigatorStatus(progress)
  const inductionProgress = formalCaseProgress(progress, STORY_CASE_001.id)
  const resolvedFormalCases = FORMAL_CASE_CATALOG.filter((item) => formalCaseProgress(progress, item.id).resolved).length
  const bureauUnlocked = isBureauUnlocked(progress)
  const archive = bureauArchive(progress)
  const discovered = archive.filter((item) => item.discovered)
  const dutySyndromes = new Set(progress.duty.resolutions.map((item) => item.syndrome))
  const latestDuty = progress.duty.resolutions.at(-1)
  const dispatch = bureauDispatch(progress, endlessResume ? { seed: endlessResume.seed, solved: endlessResume.solved } : undefined)
  const hasOpenDuty = Boolean(endlessResume && !endlessResume.solved)
  const queueStart = endlessResume?.solved ? endlessResume.seed + 1 : dutySeed
  const dutyQueue = nextDutySeeds(progress, queueStart).map((caseSeed) => createDutyCasePreview(caseSeed))

  return (
    <main className="bureau-hub" aria-label="AI异常调查局主页">
      <div className="bureau-hub-scanlines" aria-hidden="true" />
      <header className="bureau-hub-header">
        <div className="bureau-hub-brand">
          <span className="bureau-hub-mark">A<span>/</span>Δ</span>
          <div><small>ANOMALY BUREAU // INTERNAL</small><h1>AI异常调查局</h1></div>
        </div>
        <div className="bureau-investigator-card" aria-label="调查员状态">
          <small>INVESTIGATOR STATUS</small>
          <strong>{status.label}</strong>
          <span>{status.code}</span>
        </div>
      </header>

      <section className="bureau-shift-strip" aria-label="调查局值班摘要">
        <div><small>正式案件</small><strong>{resolvedFormalCases} / {FORMAL_CASE_CATALOG.length} CLOSED</strong></div>
        <div><small>值班结案</small><strong>{progress.duty.resolutions.length}</strong></div>
        <div><small>病症档案</small><strong>{dutySyndromes.size} / 4</strong></div>
        <div><small>知识条目</small><strong>{discovered.length} / {archive.length}</strong></div>
        <div className="bureau-shift-priority" aria-label="当前值班优先级">
          <small>{dispatch.code}</small>
          <strong>{dispatch.title}</strong>
          <p>{dispatch.detail}</p>
          <button type="button" onClick={() => onSectionChange(dispatch.target)}>{dispatch.action}</button>
        </div>
      </section>

      {inductionProgress.resolved && !progress.inductionAcknowledged && (
        <section className="bureau-induction" role="dialog" aria-label="正式调查员权限已开放">
          <div className="bureau-induction-stamp">CLEARANCE<br />GRANTED</div>
          <div className="bureau-induction-copy">
            <small>{formalCaseCode(STORY_CASE_001)} / ARCHIVED</small>
            <h2>新人案件结案。正式调查员权限已开放。</h2>
            <p>从现在开始，案件板会用一连串手工谜题逐步增加新的调查工具；训练中心练方法，调查档案记录你真正见过的故障，值班室负责把这些方法用在陌生程序化案件上。</p>
            <div className="bureau-induction-unlocks"><span>✓ 调查档案</span><span>✓ 训练中心</span><span>✓ 值班室</span></div>
          </div>
          <button type="button" onClick={onAcknowledgeInduction}>接收调查员证件</button>
        </section>
      )}

      <div className="bureau-hub-layout">
        <nav className="bureau-department-nav" aria-label="调查局部门">
          {(Object.keys(SECTION_META) as HubSection[]).map((id) => {
            const meta = SECTION_META[id]
            const locked = id === 'duty' && !bureauUnlocked
            return (
              <button
                type="button"
                key={id}
                className={section === id ? 'active' : ''}
                aria-pressed={section === id}
                disabled={locked}
                onClick={() => onSectionChange(id)}
              >
                <small>{meta.code}</small><strong>{meta.label}</strong><span>{locked ? '入职后开放' : meta.description}</span>
              </button>
            )
          })}
        </nav>

        <section className="bureau-workdesk" aria-live="polite">
          <div className="bureau-workdesk-head">
            <div><small>{SECTION_META[section].code}</small><h2>{SECTION_META[section].label}</h2></div>
            <span>{SECTION_META[section].description}</span>
          </div>

          {section === 'case-board' && (
            <div className="bureau-case-board">
              {FORMAL_CASE_CATALOG.map((definition) => {
                const caseProgress = formalCaseProgress(progress, definition.id)
                const resume = formalCaseResumes?.[definition.id]
                const available = isFormalCaseAvailable(progress, definition)
                const unlockAfter = 'unlockAfter' in definition ? definition.unlockAfter : undefined
                const prerequisite = unlockAfter ? FORMAL_CASE_CATALOG.find((item) => item.id === unlockAfter) : undefined
                return (
                  <article className={`bureau-case-file ${available ? 'primary' : 'locked'}`} key={definition.id}>
                    <header><span>{formalCaseCode(definition)}</span><StatusPill tone={caseProgress.resolved ? 'yellow' : available ? 'blue' : 'muted'}>{caseProgress.resolved ? 'CLOSED' : available ? 'ACTIVE' : 'SEALED'}</StatusPill></header>
                    <div className="bureau-case-file-body">
                      <div className="bureau-case-icon" aria-hidden="true">{definition.icon[0]}<br /><i>{definition.icon[1]}</i><br />{definition.icon[2]}</div>
                      <div>
                        <small>{definition.classification}</small>
                        <h3>{definition.title}</h3>
                        <p>{definition.incident}{definition.objective}</p>
                        <div className="bureau-case-meta">
                          {definition.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                      </div>
                    </div>
                    <footer>
                      <div>
                        {caseProgress.resolved ? <><small>BEST REPORT</small><strong>{caseProgress.bestGrade ?? '—'} · {caseProgress.bestScore ?? '—'}/100</strong></> : !available ? <><small>PREREQUISITE</small><strong>{prerequisite ? `先完成 ${formalCaseCode(prerequisite)}` : '前置案件尚未完成'}</strong></> : resume ? <><small>CHECKPOINT</small><strong>{resume.stageLabel}</strong></> : <><small>ASSIGNMENT</small><strong>{definition.assignment}</strong></>}
                      </div>
                      <button type="button" disabled={!available} onClick={() => onOpenFormalCase(definition.id)}>{!available ? '案件封存中' : caseProgress.resolved ? (resume?.solved ? '打开结案案卷' : `重新调查 ${formalCaseCode(definition)}`) : resume ? `继续 ${formalCaseCode(definition)}` : `接收 ${formalCaseCode(definition)}`}</button>
                    </footer>
                  </article>
                )
              })}

              <article className="bureau-case-file locked">
                <header><span>CASE 005+</span><StatusPill tone="muted">SEALED</StatusPill></header>
                <div className="bureau-locked-file"><strong>后续调查模块待编入</strong><p>新的正式案件继续遵守“每关新增一个可操作原语，再复用旧原语”的结构，不用 Duty 工单冒充剧情关。</p></div>
              </article>
            </div>
          )}

          {section === 'training' && (
            <div className="bureau-training-panel">
              {TRAINING_CASE_CATALOG.map((definition) => {
                const caseProgress = trainingCaseProgress(progress, definition.id)
                return (
                  <Fragment key={definition.id}>
                    <article className="bureau-terminal-card">
                      <span className="bureau-terminal-index">{definition.number}</span>
                      <div><small>{definition.classification}</small><h3>训练案件 {definition.number} · {definition.title}</h3><p>{definition.summary}</p></div>
                      <StatusPill tone={caseProgress.completed ? 'yellow' : 'blue'}>{caseProgress.completed ? 'CLEARED' : 'AVAILABLE'}</StatusPill>
                    </article>
                    <div className="bureau-training-brief">
                      <strong>训练中心不会替正式案件做判断。</strong>
                      <p>这里负责教调查方法；值班室只给事实和下一步动作，不会动态告诉你应该选什么答案。</p>
                      <button type="button" onClick={() => onTraining(definition.id)}>{caseProgress.completed ? '重新进行训练案件' : `开始 ${trainingCaseCode(definition)}`}</button>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}

          {section === 'archive' && (
            <div className="bureau-archive-panel">
              <div className="bureau-archive-summary"><strong>{discovered.length} / {archive.length}</strong><span>已发现条目</span><p>档案不是技能树：只有你在案件里真正遇到过的概念才会亮起。</p></div>
              <div className="bureau-archive-grid">
                {archive.map((item, index) => (
                  <article key={item.id} className={item.discovered ? 'discovered' : 'unknown'}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><small>{item.discovered ? item.source : 'UNKNOWN RECORD'}</small><strong>{item.discovered ? item.title : '????????'}</strong></div>
                    <i>{item.discovered ? '✓' : '·'}</i>
                  </article>
                ))}
              </div>
            </div>
          )}

          {section === 'duty' && (
            <div className="bureau-duty-panel">
              <section className="bureau-duty-console">
                <div><small>LIVE DUTY QUEUE</small><h3>监督学习 · 值班系统</h3><p>程序化异常报告。案件语境、传感器映射和故障原因都会变化；正式审计有预算，系统不会替你解释证据。</p></div>
                <div className="bureau-duty-status">
                  {endlessResume ? (
                    <><StatusPill tone={endlessResume.solved ? 'yellow' : 'blue'}>{endlessResume.solved ? 'RESOLVED SAVE' : 'OPEN CASE'}</StatusPill><strong>CASE {endlessResume.seed}</strong><span>{endlessResume.historyCount} 次审计 · 剩 {endlessResume.remainingCredits} 额度</span></>
                  ) : (
                    <><StatusPill tone="blue">QUEUE READY</StatusPill><strong>暂无未结案件</strong><span>接入后生成当前 seed 的异常报告</span></>
                  )}
                </div>
                {endlessResume && <button type="button" onClick={() => onDuty(endlessResume.seed)}>{endlessResume.solved ? '打开值班结案' : '继续未结值班案件'}</button>}
                {!hasOpenDuty && (
                  <div className="bureau-duty-queue" aria-label="待接异常报告">
                    <header><span>INCOMING REPORTS</span><strong>选择一份接案</strong></header>
                    {dutyQueue.map((candidate) => (
                      <article key={candidate.seed}>
                        <div><small>CASE {String(candidate.caseNo).padStart(4, '0')}</small><strong>{candidate.title.replace(/^CASE \/ /, '')}</strong><p>{candidate.incident}</p></div>
                        <button type="button" onClick={() => onDuty(candidate.seed)}>接收报告</button>
                      </article>
                    ))}
                  </div>
                )}
                {hasOpenDuty && <p className="bureau-duty-queue-locked">当前还有一宗未结值班案件。先继续或在案件入口明确放弃旧案，新的报告不会覆盖现有进度。</p>}
              </section>
              <section className="bureau-duty-history">
                <header><span>DUTY ARCHIVE</span><strong>{progress.duty.resolutions.length} RESOLVED</strong></header>
                {latestDuty ? (
                  <div className="bureau-duty-latest"><small>LATEST</small><strong>CASE {latestDuty.seed} · {latestDuty.grade}</strong><span>{latestDuty.score}/100 · {PATHOLOGY_LABEL[latestDuty.syndrome]}</span></div>
                ) : <p>还没有值班结案。训练中心可以先教你怎么看实验记录。</p>}
                <div className="bureau-pathology-progress" aria-label="已处理病症">
                  {(['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'] as DutySyndrome[]).map((id) => <span key={id} className={dutySyndromes.has(id) ? 'known' : ''}>{dutySyndromes.has(id) ? '◆' : '◇'} {PATHOLOGY_LABEL[id]}</span>)}
                </div>
              </section>
            </div>
          )}
        </section>

        <aside className="bureau-side-desk" aria-label="调查局侧边状态">
          <section><small>CURRENT CLEARANCE</small><strong>{status.label}</strong><p>{status.code === 'INDEPENDENT' ? '你已经在至少三类陌生故障中完成过独立结案。' : '权限来自已处理的不同异常，不来自重复刷同一案件。'}</p></section>
          <section><small>OPEN THREAD</small><strong>{endlessResume && !endlessResume.solved ? `CASE ${endlessResume.seed}` : 'NONE'}</strong><p>{endlessResume && !endlessResume.solved ? `值班案件还有 ${endlessResume.remainingCredits} 次正式审计额度。` : '没有被遗忘的未结值班案件。'}</p></section>
          <section className="bureau-xiaoxi-note"><span>析</span><p><strong>小析：</strong>调查局只负责告诉你哪里有工作。进了案件，证据还是得你自己读。</p></section>
        </aside>
      </div>
    </main>
  )
}
