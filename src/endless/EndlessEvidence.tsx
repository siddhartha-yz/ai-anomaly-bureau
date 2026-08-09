import { MODEL_META } from '../ml/registry'
import type { EndlessAudit } from './EndlessPlot'
import type { EndlessCase, EndlessSyndrome } from './generator'
import { diagnosisEvidenceStatus, experimentConfigKey, experimentDelta, type EndlessRunRecord } from './uiTypes'

export function EndlessAuditPanel({ caseData, audit, trainAccuracy, features, lastRun }: {
  caseData: EndlessCase
  audit: EndlessAudit
  trainAccuracy: number
  features: EndlessRunRecord['features']
  lastRun?: EndlessRunRecord
}) {
  return (
    <>
      <section className="endless-audit-result">
        <div><small>TRAIN</small><strong>{Math.round(trainAccuracy * 100)}%</strong></div>
        <div><small>FIELD AUDIT</small><strong>{Math.round(audit.accuracy * 100)}%</strong></div>
        <div><small>ERRORS</small><strong>{audit.errorCount}</strong></div>
        <div className={audit.recall.cat < .75 ? 'metric-danger' : ''}><small>{caseData.classNames.cat} 召回</small><strong>{Math.round(audit.recall.cat * 100)}%</strong></div>
        <div className={audit.recall.bread < .75 ? 'metric-danger' : ''}><small>{caseData.classNames.bread} 召回</small><strong>{Math.round(audit.recall.bread * 100)}%</strong></div>
        <p className="endless-reliability-check">
          <span>预测 {lastRun?.predictionHit ? '✓ HIT' : '× MISS'}</span>
          <span>总体 {audit.accuracy >= .85 ? 'PASS' : 'FAIL'}</span>
          <span>{caseData.classNames.cat}召回 {audit.recall.cat >= .75 ? 'PASS' : 'FAIL'}</span>
          <span>{caseData.classNames.bread}召回 {audit.recall.bread >= .75 ? 'PASS' : 'FAIL'}</span>
        </p>
      </section>
      {audit.mistakes.length > 0 && (
        <section className="endless-evidence">
          <div className="endless-panel-head"><span>FIELD_ERRORS.LOG</span><strong>抽取前 {Math.min(4, audit.mistakes.length)} 条错误</strong></div>
          <div className="endless-error-grid">
            {audit.mistakes.slice(0, 4).map((mistake) => (
              <article key={mistake.id}>
                <b>{caseData.classNames[mistake.actual]}</b>
                <span>→ 被判为 {caseData.classNames[mistake.predicted]}</span>
                <small>{caseData.featureNames[features[0]]} {mistake.features[features[0]].toFixed(2)} · {caseData.featureNames[features[1]]} {mistake.features[features[1]].toFixed(2)}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function EndlessRunLog({
  caseData,
  history,
  selectedEvidenceIds = [],
  evidenceSelectable = false,
  lastDiagnosisRunCount = 0,
  attention = false,
  onToggleEvidence,
}: {
  caseData: EndlessCase
  history: EndlessRunRecord[]
  selectedEvidenceIds?: number[]
  evidenceSelectable?: boolean
  lastDiagnosisRunCount?: number
  attention?: boolean
  onToggleEvidence?: (runId: number) => void
}) {
  if (!history.length) return null
  const configurationCount = new Set(history.map((record) => experimentConfigKey(record.model, record.features))).size
  const cited = diagnosisEvidenceStatus(history, selectedEvidenceIds, lastDiagnosisRunCount)
  const citationMessage = cited.ready
    ? `证据包就绪：E${String(cited.records[0].id).padStart(2, '0')} + E${String(cited.records[1].id).padStart(2, '0')}`
    : cited.records.length < 2
      ? `请选择两条记录作为诊断依据（${cited.records.length}/2）`
      : cited.distinctConfigurations < 2
        ? '这两条记录属于同一配置；请引用一条不同配置的对照记录。'
        : '下一份报告必须包含上次诊断后新增的实验记录。'
  return (
    <section className={`endless-run-log ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>EXPERIMENTS.LOG</span><strong>{history.length} 次审计 · {configurationCount} 种配置</strong></div>
      {evidenceSelectable && (
        <div className={`endless-citation-status ${cited.ready ? 'ready' : ''}`} aria-label="诊断证据引用状态">
          <b>DIAGNOSIS EVIDENCE</b><span>{citationMessage}</span>
        </div>
      )}
      {history.map((record, index) => {
        const seenBefore = history.slice(0, index).some((previous) =>
          experimentConfigKey(previous.model, previous.features) === experimentConfigKey(record.model, record.features),
        )
        const delta = seenBefore ? 'repeat' : experimentDelta(history[index - 1], record)
        const deltaLabel = delta === 'baseline' ? 'BASELINE'
          : delta === 'repeat' ? '复现实验'
            : delta === 'fields-only' ? '只换字段'
              : delta === 'model-only' ? '只换模型'
                : '字段 + 模型都换'
        return (
        <article key={record.id} data-delta={delta} className={selectedEvidenceIds.includes(record.id) ? 'evidence-selected' : ''}>
          <i>{String(record.id).padStart(2, '0')}</i>
          <span>{caseData.featureNames[record.features[0]]} + {caseData.featureNames[record.features[1]]}<small>{MODEL_META[record.model].label} · 最低召回 {Math.round(Math.min(record.recall.cat, record.recall.bread) * 100)}%</small><small className={`experiment-delta ${delta}`}>Δ {deltaLabel}</small></span>
          <b>{Math.round(record.train * 100)} → {Math.round(record.test * 100)}%</b>
          <em>
            <span>{record.predictionHit ? '预测✓' : '预测×'} · {record.reliable ? '可靠✓' : '可靠×'}</span>
            {evidenceSelectable && onToggleEvidence && (
              <button
                type="button"
                className="evidence-cite-button"
                aria-pressed={selectedEvidenceIds.includes(record.id)}
                disabled={!selectedEvidenceIds.includes(record.id) && selectedEvidenceIds.length >= 2}
                onClick={() => onToggleEvidence(record.id)}
              >
                {selectedEvidenceIds.includes(record.id) ? `✓ 已引用 E${String(record.id).padStart(2, '0')}` : `引用 E${String(record.id).padStart(2, '0')}`}
              </button>
            )}
          </em>
        </article>
      )})}
    </section>
  )
}

export function EndlessDiagnosis({
  caseData,
  value,
  attempts,
  best,
  canSubmit,
  credits,
  submittedDiagnosis,
  lastOutcome,
  evidenceRecords,
  evidenceReady,
  diagnosisAvailable,
  attention = false,
  onChange,
  onSubmit,
  onEmergency,
}: {
  caseData: EndlessCase
  value?: EndlessSyndrome
  attempts: number
  best: number
  canSubmit: boolean
  credits: number
  submittedDiagnosis?: EndlessSyndrome
  lastOutcome?: 'wrong' | 'needs-reliable'
  evidenceRecords: EndlessRunRecord[]
  evidenceReady: boolean
  diagnosisAvailable: boolean
  attention?: boolean
  onChange: (value: EndlessSyndrome) => void
  onSubmit: () => void
  onEmergency: () => void
}) {
  return (
    <section className={`endless-diagnosis ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>04 / DIAGNOSIS</span><strong>提交病因</strong></div>
      <p>先从实验日志引用两条不同配置的记录，再把它们写成病因判断。原样复现可以验证稳定性，但不算新的区分证据。</p>
      <div className={`diagnosis-evidence-packet ${evidenceReady ? 'ready' : ''}`}>
        <small>引用证据</small>
        <strong>{evidenceRecords.length ? evidenceRecords.map((record) => `E${String(record.id).padStart(2, '0')}`).join(' + ') : '尚未建立证据包'}</strong>
        <span>{evidenceReady ? '两条对照记录已进入本次诊断报告。' : '返回 EXPERIMENTS.LOG 选择两条有效记录。'}</span>
      </div>
      {caseData.diagnosis.options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={value === option.id ? 'selected' : ''}
          disabled={!diagnosisAvailable || !evidenceReady}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
      <button type="button" className="endless-primary" disabled={!value || !canSubmit} onClick={onSubmit}>提交诊断</button>
      {attempts > 0 && !canSubmit && submittedDiagnosis && (
        <div className="diagnosis-retry diagnosis-locked">
          <strong>刚提交：{caseData.diagnosis.options.find((option) => option.id === submittedDiagnosis)?.label}</strong>
          {lastOutcome === 'wrong' ? (
            <span>当前证据不支持这项病因判断。报告已暂时锁定；请至少改变一个观察字段或模型，再完成一次正式审计。原样复现不会提供新的区分证据。</span>
          ) : (
            <span>病因方向已经抓到，但目前还没有任何方案同时达到总体与两类召回的可靠线。先找到可靠方案，再回来结案。</span>
          )}
          {credits <= 0 && (
            <button type="button" className="endless-emergency diagnosis-emergency" onClick={onEmergency}>
              申请 1 次补充审计（评级扣分）
            </button>
          )}
        </div>
      )}
      {attempts > 0 && diagnosisAvailable && !evidenceReady && <div className="diagnosis-retry">已获得新的实验配置。请把包含新记录的两条对照证据引用进报告，再重新判断。</div>}
      {attempts > 0 && canSubmit && <div className="diagnosis-retry">新证据已经写入报告，诊断提交已重新开放。当前最佳未知表现 {Math.round(best * 100)}%。</div>}
    </section>
  )
}
