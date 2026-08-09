import { MODEL_META } from '../ml/registry'
import type { EndlessAudit } from './EndlessPlot'
import type { EndlessCase, EndlessSyndrome } from './generator'
import { experimentConfigKey, experimentDelta, type EndlessRunRecord } from './uiTypes'

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

export function EndlessRunLog({ caseData, history, attention = false }: { caseData: EndlessCase; history: EndlessRunRecord[]; attention?: boolean }) {
  if (!history.length) return null
  const configurationCount = new Set(history.map((record) => experimentConfigKey(record.model, record.features))).size
  return (
    <section className={`endless-run-log ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>EXPERIMENTS.LOG</span><strong>{history.length} 次审计 · {configurationCount} 种配置</strong></div>
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
        <article key={record.id} data-delta={delta}>
          <i>{String(record.id).padStart(2, '0')}</i>
          <span>{caseData.featureNames[record.features[0]]} + {caseData.featureNames[record.features[1]]}<small>{MODEL_META[record.model].label} · 最低召回 {Math.round(Math.min(record.recall.cat, record.recall.bread) * 100)}%</small><small className={`experiment-delta ${delta}`}>Δ {deltaLabel}</small></span>
          <b>{Math.round(record.train * 100)} → {Math.round(record.test * 100)}%</b>
          <em>{record.predictionHit ? '预测✓' : '预测×'} · {record.reliable ? '可靠✓' : '可靠×'}</em>
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
  attention?: boolean
  onChange: (value: EndlessSyndrome) => void
  onSubmit: () => void
  onEmergency: () => void
}) {
  return (
    <section className={`endless-diagnosis ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>04 / DIAGNOSIS</span><strong>提交病因</strong></div>
      <p>至少比较两种不同实验配置后，给出你认为最核心的故障原因。原样复现可以验证稳定性，但不算新的区分证据。</p>
      {caseData.diagnosis.options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={value === option.id ? 'selected' : ''}
          disabled={attempts > 0 && !canSubmit}
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
      {attempts > 0 && canSubmit && <div className="diagnosis-retry">已获得新证据，诊断报告已重新开放。当前最佳未知表现 {Math.round(best * 100)}%。</div>}
    </section>
  )
}
