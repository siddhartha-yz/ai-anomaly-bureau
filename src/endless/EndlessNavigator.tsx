import type { FeatureKey } from '../ml/types'
import type { EndlessCase, EndlessSyndrome } from './generator'
import type { EndlessRunRecord, InspectedFieldError } from './uiTypes'

export type EndlessFocus = 'baseline' | 'configure' | 'predict' | 'review' | 'diagnose'
export type EndlessObjectiveTarget = 'train' | 'configure' | 'audit' | 'run-log' | 'diagnosis' | 'recovery'
export type EndlessObjectiveState = { focus: EndlessFocus; code: string; title: string; detail: string; target: EndlessObjectiveTarget }

export function objectiveFor({
  trained,
  auditComplete,
  history,
  diagnosisAvailable,
  evidenceReady,
  diagnosisLocked,
  credits,
}: {
  trained: boolean
  auditComplete: boolean
  history: EndlessRunRecord[]
  diagnosisAvailable: boolean
  evidenceReady: boolean
  diagnosisLocked: boolean
  credits: number
}): EndlessObjectiveState {
  if (diagnosisLocked && credits <= 0) {
    return { focus: 'diagnose', code: 'RECOVER / NO CREDIT', title: '诊断要改口，但审计额度已经耗尽', detail: '在诊断报告里申请 1 次补充审计。它会扣评级，但不会让案件死锁。', target: 'recovery' }
  }
  if (diagnosisLocked && trained && !auditComplete) {
    return { focus: 'predict', code: 'RECOVER / VERIFY', title: '新方案已经训练，先留下预测', detail: '上一份诊断需要新证据才能改口。先预测现场区间，再运行这次正式审计。', target: 'audit' }
  }
  if (diagnosisLocked) {
    return { focus: 'configure', code: 'RECOVER / NEW EVIDENCE', title: '取得一条新的独立证据', detail: '上一份诊断报告已锁定。改变一个因素，重新训练并完成一次正式审计。', target: 'configure' }
  }
  if (diagnosisAvailable && !evidenceReady) {
    return { focus: 'diagnose', code: 'EVIDENCE / CITE', title: '从实验记录引用两条证据', detail: '选择两条来自不同配置的实验记录。诊断必须明确建立在你亲手取得的对照证据上。', target: 'run-log' }
  }
  if (diagnosisAvailable && evidenceReady) {
    return { focus: 'diagnose', code: 'DIAGNOSIS / READY', title: '证据包已就绪，形成病因判断', detail: '用刚引用的两条实验记录解释系统为什么会坏，而不是只看其中最高的一次分数。', target: 'diagnosis' }
  }
  if (auditComplete) {
    return { focus: 'configure', code: 'CONTROL / NEXT RUN', title: history.length < 2 ? '建立一条对照实验' : '继续获取能区分解释的证据', detail: '本轮已经封存。尽量只改变一个因素，再重新训练。', target: 'configure' }
  }
  if (trained) {
    return { focus: 'predict', code: 'HYPOTHESIS / BEFORE AUDIT', title: '先预测，再花审计额度验证', detail: '写下你认为现场会落在哪个区间，然后运行现场审计。', target: 'audit' }
  }
  if (!history.length) {
    return { focus: 'baseline', code: 'BASELINE / FIRST RUN', title: '先建立第一条基线记录', detail: '第一条实验不需要一次猜对。直接用当前配置训练，先拿到一个可以比较的起点。', target: 'train' }
  }
  return { focus: 'configure', code: 'CONTROL / NEXT RUN', title: '配置下一次实验', detail: '尽量只改变一个因素，再训练当前方案。这样结果变化才更容易解释。', target: 'configure' }
}

export function EndlessObjective({ objective, credits, historyCount, configurationCount, resumed = false, onLocate }: {
  objective: ReturnType<typeof objectiveFor>
  credits: number
  historyCount: number
  configurationCount: number
  resumed?: boolean
  onLocate: () => void
}) {
  const locateLabel = objective.target === 'recovery' ? '定位：补充审计'
    : objective.target === 'train' ? '定位：训练当前方案'
      : objective.target === 'audit' ? '定位：预测与审计'
        : objective.target === 'run-log' ? '定位：引用实验记录'
          : objective.target === 'diagnosis' ? '定位：诊断报告'
            : '定位：实验配置'
  return (
    <section className={`endless-next-objective focus-${objective.focus}`} aria-label="当前调查目标">
      <div><small>NEXT OBJECTIVE // {objective.code}</small><h2>{objective.title}</h2><p>{objective.detail}</p></div>
      <div className="endless-objective-side">
        {resumed && <span className="endless-session-restored" aria-label="已恢复本案进度">↻ 已恢复本案</span>}
        <div className="endless-objective-stats"><span>实验记录 <b>{historyCount}</b></span><span>不同配置 <b>{configurationCount}</b></span><span>审计额度 <b>{credits}</b></span></div>
        <button type="button" className="endless-locate-next" aria-label="定位下一步操作" onClick={onLocate}>
          ▶ {locateLabel}
        </button>
      </div>
    </section>
  )
}

export function EndlessLeadBoard({
  caseData,
  history,
  inspectedArchiveIds = [],
  inspectedFieldErrors = [],
}: {
  caseData: EndlessCase
  history: EndlessRunRecord[]
  inspectedArchiveIds?: string[]
  inspectedFieldErrors?: InspectedFieldError[]
}) {
  const latest = history.at(-1)
  const inspectedAlerts = caseData.archiveAlerts.filter((alert) => inspectedArchiveIds.includes(alert.id))
  const evidenceCount = (inspectedAlerts.length > 0 ? 1 : 0) + history.length + inspectedFieldErrors.length
  return (
    <section className="endless-lead-board" aria-label="案件线索板">
      <div className="endless-panel-head"><span>CASE_LEADS.LOG</span><strong>{evidenceCount ? `${evidenceCount} 条新增证据` : '等待实验'}</strong></div>
      <div className="endless-lead-list">
        {inspectedAlerts.length > 0 && (
          <article className="archive-alert">
            <i>A!</i>
            <span><b>已打开档案质量告警 {inspectedAlerts.length}/{caseData.archiveAlerts.length}</b>{inspectedAlerts[0].label}<small>{inspectedAlerts.map((alert) => alert.id.toUpperCase()).join(' / ')}</small></span>
          </article>
        )}
        {history.slice(-3).map((record) => (
          <article className={record.id === latest?.id ? 'latest' : ''} key={`run-${record.id}`}>
            <i>E{record.id}</i>
            <span>正式审计 #{record.id}：总体 {Math.round(record.test * 100)}%，最低类别召回 {Math.round(Math.min(record.recall.cat, record.recall.bread) * 100)}%。</span>
          </article>
        ))}
        {inspectedFieldErrors.slice(-3).map((error, index) => (
          <article className="field-error-lead" key={`${error.runId}-${error.sampleId}`}>
            <i>F{Math.max(1, inspectedFieldErrors.length - 2 + index)}</i>
            <span>已检查现场误判 {error.sampleId.toUpperCase()}（审计 #{error.runId}）：{caseData.classNames[error.actual]} → {caseData.classNames[error.predicted]}。</span>
          </article>
        ))}
        {!evidenceCount && <article className="empty"><i>?</i><span>{caseData.archiveAlerts.length ? '可以先打开图中的橙色「!」，或直接建立第一条正式审计。你亲手查看过的事实会记录在这里。' : '先完成第一条正式审计。新获得的现场事实会记录在这里。'}</span></article>}
      </div>
    </section>
  )
}

export function EndlessArchiveEvidence({
  caseData,
  sampleId,
  features,
  onClose,
}: {
  caseData: EndlessCase
  sampleId?: string
  features: [FeatureKey, FeatureKey]
  onClose: () => void
}) {
  if (!sampleId) return null
  const sample = caseData.train.find((item) => item.id === sampleId)
  const alert = caseData.archiveAlerts.find((item) => item.id === sampleId)
  if (!sample || !alert) return null
  return (
    <section className="endless-archive-evidence" aria-label="历史档案异常记录">
      <div className="endless-panel-head"><span>ARCHIVE_RECORD / {sampleId.toUpperCase()}</span><button type="button" onClick={onClose}>×</button></div>
      <div className="endless-archive-evidence-body">
        <div><small>ARCHIVE LABEL</small><strong>{caseData.classNames[sample.label]}</strong></div>
        <div><small>QUALITY FLAG</small><strong>{alert.label}</strong></div>
        <div><small>{caseData.featureNames[features[0]]}</small><strong>{sample.features[features[0]].toFixed(2)}</strong></div>
        <div><small>{caseData.featureNames[features[1]]}</small><strong>{sample.features[features[1]].toFixed(2)}</strong></div>
      </div>
      <p>这是档案系统留下的采集质量事实。它说明这条记录值得怀疑，但不会自动告诉你模型是否真的依赖了它；需要用实验验证。</p>
    </section>
  )
}

export function syndromeLabel(syndrome: EndlessSyndrome) {
  return syndrome === 'feature-gap' ? '观察特征没有抓住真正差异'
    : syndrome === 'overfit-noise' ? '模型把训练噪声和偶然点记得太死'
      : syndrome === 'distribution-shift' ? '训练环境与现场环境发生了分布变化'
        : '多数类把总体准确率撑高，少数类却一直漏掉'
}
