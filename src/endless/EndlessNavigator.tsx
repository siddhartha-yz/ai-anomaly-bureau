import type { FeatureKey } from '../ml/types'
import type { EndlessCase, EndlessCaseLeadId, EndlessSyndrome } from './generator'
import { discriminatingExperiment, earnedCaseLeadReviewCount, hypothesisAxisStatus, type EndlessRunRecord, type InspectedFieldError } from './uiTypes'

export type EndlessFocus = 'baseline' | 'configure' | 'predict' | 'review' | 'diagnose'
export type EndlessObjectiveTarget = 'train' | 'lead-board' | 'configure' | 'audit' | 'run-log' | 'diagnosis' | 'recovery'
export type EndlessObjectiveState = { focus: EndlessFocus; code: string; title: string; detail: string; target: EndlessObjectiveTarget }

export function canInspectCaseLead(history: EndlessRunRecord[], inspectedLeadCount: number, alreadyInspected: boolean) {
  const earnedReviews = earnedCaseLeadReviewCount(history)
  return alreadyInspected || (earnedReviews > 0 && inspectedLeadCount < earnedReviews)
}

export function objectiveFor({
  trained,
  auditComplete,
  history,
  diagnosisAvailable,
  evidenceReady,
  diagnosisSourceReady = true,
  diagnosisLocked,
  credits,
  inspectedCaseLeadCount = 0,
  needsFalsification = false,
}: {
  trained: boolean
  auditComplete: boolean
  history: EndlessRunRecord[]
  diagnosisAvailable: boolean
  evidenceReady: boolean
  diagnosisSourceReady?: boolean
  diagnosisLocked: boolean
  credits: number
  inspectedCaseLeadCount?: number
  needsFalsification?: boolean
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
  if (diagnosisAvailable && evidenceReady && !diagnosisSourceReady) {
    return {
      focus: 'review',
      code: 'CAUSE / SUPPORT',
      title: '当前病因还缺一条正向来源事实',
      detail: '实验已经支持这条机制，但报告还缺它声称的直接来源。回到因果线索，复核对应来源；如果来源不支持，就应改掉病因判断。',
      target: 'lead-board',
    }
  }
  if (diagnosisAvailable && evidenceReady) {
    return { focus: 'diagnose', code: 'DIAGNOSIS / READY', title: '证据包已就绪，形成病因判断', detail: '用刚引用的两条实验记录解释系统为什么会坏，而不是只看其中最高的一次分数。', target: 'diagnosis' }
  }
  if (auditComplete && history.length > 0 && inspectedCaseLeadCount === 0) {
    return {
      focus: 'review',
      code: 'CAUSE / CHOOSE A LEAD',
      title: '事故已经复现，先决定查哪一种原因',
      detail: '档案构成、采集批次、质量记录现在都可以复核。先打开一条你认为最能区分因果故事的线索，再设计下一次实验。',
      target: 'lead-board',
    }
  }
  if (auditComplete && needsFalsification) {
    return {
      focus: 'review',
      code: 'CAUSE / FALSIFY',
      title: '方案已经能工作，但你还没有排除竞争解释',
      detail: '不要急着命名病因。再查一份原因来源，或设计一次你预测“应该几乎不起作用”的单变量实验；只有真的杀掉一个解释，报告才够硬。',
      target: 'lead-board',
    }
  }
  if (auditComplete) {
    return {
      focus: 'configure',
      code: 'CONTROL / NEXT RUN',
      title: history.length < 2 ? '让两个解释真正分叉' : '继续获取能区分解释的证据',
      detail: history.length < 2
        ? 'H-FIELDS 与 H-MODEL 现在都还说得通。下一次只换字段或只换模型，让其中一条预测被结果削弱。'
        : '优先做单变量对照。只有结果真正拉开，才算减少了不确定性。',
      target: 'configure',
    }
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
      : objective.target === 'lead-board' ? '定位：因果线索'
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
  inspectedCaseLeadIds = [],
  inspectedArchiveIds = [],
  inspectedFieldErrors = [],
  onInspectCaseLead,
}: {
  caseData: EndlessCase
  history: EndlessRunRecord[]
  inspectedCaseLeadIds?: EndlessCaseLeadId[]
  inspectedArchiveIds?: string[]
  inspectedFieldErrors?: InspectedFieldError[]
  onInspectCaseLead?: (id: EndlessCaseLeadId) => void
}) {
  const causeCodes: Record<EndlessCaseLeadId, string> = {
    composition: 'H-COVERAGE',
    batch: 'H-CONTEXT',
    quality: 'H-RECORDS',
  }
  const latest = history.at(-1)
  const fieldStatus = hypothesisAxisStatus(history, 'fields')
  const modelStatus = hypothesisAxisStatus(history, 'model')
  const latestPair = history.length >= 2 ? discriminatingExperiment(history.at(-2)!, history.at(-1)!) : undefined
  const inspectedAlerts = caseData.archiveAlerts.filter((alert) => inspectedArchiveIds.includes(alert.id))
  const evidenceCount = inspectedCaseLeadIds.length + (inspectedAlerts.length > 0 ? 1 : 0) + history.length + inspectedFieldErrors.length
  const earnedReviews = earnedCaseLeadReviewCount(history)
  return (
    <section className="endless-lead-board" aria-label="案件线索板">
      <div className="endless-panel-head"><span>CASE_LEADS.LOG</span><strong>{evidenceCount ? `${evidenceCount} 条新增证据` : '等待实验'}</strong></div>
      <section className="endless-causal-leads" aria-label="因果线索来源">
        <div className="endless-hypothesis-head"><small>COMPETING CAUSES</small><strong>{history.length ? '基线后，每个新的单变量对照解封一份原因来源' : '先复现事故，三条因果假设随后解封'}</strong></div>
        {history.length > 0 && <p className="endless-causal-cadence">第一次 baseline 提供 1 次来源解封额度；之后只有此前未审计过、且相对上一轮只改字段或只改模型的配置才再提供 1 次。重复配置与字段 + 模型同时改动都不会解封。未使用额度可保留，当前可新开 {Math.max(0, earnedReviews - inspectedCaseLeadIds.length)} 份。</p>}
        <div className="endless-causal-lead-grid">
          {caseData.leadSources.map((lead) => {
            const inspected = inspectedCaseLeadIds.includes(lead.id)
            const available = canInspectCaseLead(history, inspectedCaseLeadIds.length, inspected)
            return (
              <button
                type="button"
                key={lead.id}
                disabled={!available}
                className={inspected ? 'inspected' : ''}
                onClick={() => onInspectCaseLead?.(lead.id)}
              >
                <i>{causeCodes[lead.id]} · {inspected ? 'OPEN' : available ? 'READY' : 'SEALED'}</i>
                <strong>{lead.label}</strong>
                <small>{inspected ? lead.finding : available ? lead.prompt : '需要先完成一个新的单变量正式对照，才能继续解封来源。'}</small>
              </button>
            )
          })}
        </div>
      </section>
      {history.length > 0 && (
        <section className="endless-hypothesis-board" aria-label="竞争假设">
          <div className="endless-hypothesis-head"><small>COMPETING HYPOTHESES</small><strong>下一次实验要让两条预测分叉</strong></div>
          <article className={fieldStatus}>
            <i>H-FIELDS</i>
            <span><b>观察字段对现场失效起关键作用</b><small>预测：保持判断规则不变，只换观察字段，FIELD 或最低召回应发生明显变化。</small></span>
            <em>{fieldStatus.toUpperCase()}</em>
          </article>
          <article className={modelStatus}>
            <i>H-MODEL</i>
            <span><b>判断规则对现场失效起关键作用</b><small>预测：保持观察字段不变，只换判断规则，FIELD 或最低召回应发生明显变化。</small></span>
            <em>{modelStatus.toUpperCase()}</em>
          </article>
          <p>
            {fieldStatus === 'contested' || modelStatus === 'contested'
              ? `${fieldStatus === 'contested' ? 'H-FIELDS' : 'H-MODEL'} 在不同受控实验里既出现过显著变化，也出现过近乎 null 的结果：这不是“最后一次实验覆盖前一次”，而是条件依赖的冲突证据。回到这些实验的共同端点，检查什么条件让该因素时而重要、时而不起作用。`
              : fieldStatus === 'supported' && modelStatus === 'supported'
              ? '字段轴和模型轴都曾在单变量实验中显著改变现场结果：单一“只怪字段”或“只怪模型”的解释都不够，继续检查它们如何共同造成失效。'
              : fieldStatus === 'supported' && modelStatus === 'weakened'
                ? '字段实验产生了显著变化，而最近一次模型-only 测试变化很小：H-MODEL 被削弱。'
                : modelStatus === 'supported' && fieldStatus === 'weakened'
                  ? '模型实验产生了显著变化，而最近一次 fields-only 测试变化很小：H-FIELDS 被削弱。'
                  : fieldStatus === 'supported'
                    ? 'H-FIELDS 已得到单变量证据支持；H-MODEL 仍是未测试解释。若要排除它，就让模型-only 预测也接受一次审计。'
                    : modelStatus === 'supported'
                      ? 'H-MODEL 已得到单变量证据支持；H-FIELDS 仍是未测试解释。若要排除它，就让 fields-only 预测也接受一次审计。'
                      : fieldStatus === 'weakened' || modelStatus === 'weakened'
                        ? `${fieldStatus === 'weakened' ? 'H-FIELDS' : 'H-MODEL'} 的单变量预测没有造成足够大的现场变化，这条解释已被削弱；另一条仍然 OPEN。`
                        : latestPair?.delta === 'mixed'
                ? '最新一轮同时改了字段和模型：即使分数变化，也无法知道是哪一个因素造成。两条解释继续 OPEN。'
                : latestPair?.delta === 'repeat'
                  ? '最新一轮是同配置复现：它能检查稳定性，但不能区分 H-FIELDS 与 H-MODEL。'
                  : latestPair && latestPair.axis
                    ? `最新单变量结果只变化 ${Math.round(latestPair.materialChange * 100)}pt，证据还不足以削弱另一条解释。`
                    : '基线只能告诉你“系统确实会坏”，还不能告诉你应该换眼睛还是换规则。'}
          </p>
        </section>
      )}
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
