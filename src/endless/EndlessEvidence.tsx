import { MODEL_META } from '../ml/registry'
import type { EndlessAudit } from './EndlessPlot'
import type { EndlessCase, EndlessSyndrome } from './generator'
import { causalPredictionResult, compareExperimentRecords, diagnosisEvidenceStatus, diagnosisInterventionAxis, discriminatingExperiment, experimentConfigKey, experimentDelta, type EndlessRunRecord } from './uiTypes'

function signedPoints(value: number) {
  const points = Math.round(value * 100)
  return `${points > 0 ? '+' : ''}${points}pt`
}

export function EndlessAuditPanel({ caseData, audit, trainAccuracy, features, lastRun, selectedMistakeId, onMistakeSelect }: {
  caseData: EndlessCase
  audit: EndlessAudit
  trainAccuracy: number
  features: EndlessRunRecord['features']
  lastRun?: EndlessRunRecord
  selectedMistakeId?: string
  onMistakeSelect?: (mistake: EndlessAudit['mistakes'][number]) => void
}) {
  const selectedMistake = audit.mistakes.find((mistake) => mistake.id === selectedMistakeId)
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
        <div className="endless-metric-glossary" aria-label="指标读法">
          <span><b>TRAIN</b> 历史训练档案上的表现</span>
          <span><b>FIELD</b> 正式现场审计中的表现</span>
          <span><b>召回</b> 某一类真实样本中，被模型正确识别出来的比例</span>
        </div>
      </section>
      {audit.mistakes.length > 0 && (
        <section className="endless-evidence endless-field-errors">
          <div className="endless-panel-head"><span>FIELD_ERRORS.LOG</span><strong>点击检查 · 前 {Math.min(4, audit.mistakes.length)} 条错误</strong></div>
          <div className="endless-error-grid">
            {audit.mistakes.slice(0, 4).map((mistake) => (
              <button
                type="button"
                key={mistake.id}
                className={selectedMistakeId === mistake.id ? 'selected' : ''}
                aria-pressed={selectedMistakeId === mistake.id}
                aria-label={`调查现场误判 ${mistake.id}`}
                onClick={() => onMistakeSelect?.(mistake)}
              >
                <b>{caseData.classNames[mistake.actual]}</b>
                <span>→ 被判为 {caseData.classNames[mistake.predicted]}</span>
                <small>{caseData.featureNames[features[0]]} {mistake.features[features[0]].toFixed(2)} · {caseData.featureNames[features[1]]} {mistake.features[features[1]].toFixed(2)}</small>
                <em>{selectedMistakeId === mistake.id ? '✓ 已定位到 FIELD_MATRIX' : '▶ 定位这条误判'}</em>
              </button>
            ))}
          </div>
          {selectedMistake && (
            <div className="endless-field-error-detail" aria-label="现场误判调查记录">
              <div><small>FIELD SAMPLE</small><strong>{selectedMistake.id.toUpperCase()}</strong></div>
              <div><small>ACTUAL</small><strong>{caseData.classNames[selectedMistake.actual]}</strong></div>
              <div><small>PREDICTED</small><strong>{caseData.classNames[selectedMistake.predicted]}</strong></div>
              <div><small>{caseData.featureNames[features[0]]}</small><strong>{selectedMistake.features[features[0]].toFixed(2)}</strong></div>
              <div><small>{caseData.featureNames[features[1]]}</small><strong>{selectedMistake.features[features[1]].toFixed(2)}</strong></div>
              <p>这是真实现场审计已经揭示的错误记录。图中只高亮它的位置；病因仍需要通过不同实验配置来判断。</p>
            </div>
          )}
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
  const comparison = cited.records.length === 2 ? compareExperimentRecords(cited.records[0], cited.records[1]) : undefined
  const citedDiscrimination = cited.records.length === 2 ? discriminatingExperiment(cited.records[0], cited.records[1]) : undefined
  const evidenceReady = cited.ready && Boolean(citedDiscrimination?.discriminating)
  const comparisonLabel = comparison?.delta === 'repeat' ? '同配置复现'
    : comparison?.delta === 'fields-only' ? '只换字段'
      : comparison?.delta === 'model-only' ? '只换模型'
        : comparison?.delta === 'mixed' ? '字段 + 模型都换'
          : '基线'
  const citationMessage = evidenceReady
    ? `证据包就绪：E${String(cited.records[0].id).padStart(2, '0')} + E${String(cited.records[1].id).padStart(2, '0')}`
    : cited.records.length < 2
      ? `请选择两条记录作为诊断依据（${cited.records.length}/2）`
      : cited.distinctConfigurations < 2
        ? '这两条记录属于同一配置；请引用一条不同配置的对照记录。'
        : !cited.includesFreshEvidence
          ? '下一份报告必须包含上次诊断后新增的实验记录。'
          : !cited.sequentialExperiment
            ? '这两条记录不是一次实际连续执行的实验；请引用当时真正相邻的前后两条记录，不能事后跨实验拼接对照。'
            : citedDiscrimination?.delta === 'mixed'
              ? '这两条记录同时改了字段和模型，无法知道是哪一个因素造成变化。'
              : citedDiscrimination?.delta === 'repeat'
                ? '同配置复现能检查稳定性，但不能区分 H-FIELDS 与 H-MODEL。'
                : !citedDiscrimination?.discriminating
                  ? `这是单变量对照，但现场证据只变化 ${Math.round((citedDiscrimination?.materialChange ?? 0) * 100)}pt；还不足以削弱另一条解释。`
                  : !cited.reachesReliableEndpoint
                    ? '这组因果对照没有触及任何可靠配置；它能说明某个因素会改变结果，但还不能解释你最终为什么修好了系统。请引用一组以可靠方案为端点的单变量对照。'
                    : '这组记录尚不能作为诊断证据。'
  return (
    <section className={`endless-run-log ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>EXPERIMENTS.LOG</span><strong>{history.length} 次审计 · {configurationCount} 种配置</strong></div>
      {evidenceSelectable && (
        <div className={`endless-citation-status ${evidenceReady ? 'ready' : ''}`} aria-label="诊断证据引用状态">
          <b>DIAGNOSIS EVIDENCE</b><span>{citationMessage}</span>
        </div>
      )}
      {evidenceSelectable && comparison && (
        <section className="endless-evidence-compare" aria-label="已引用实验对照">
          <div className="endless-compare-head">
            <span>E{String(cited.records[0].id).padStart(2, '0')} → E{String(cited.records[1].id).padStart(2, '0')}</span>
            <strong>{comparisonLabel}</strong>
          </div>
          <div className="endless-compare-config">
            <span><small>FIELDS</small>{caseData.featureNames[cited.records[0].features[0]]} + {caseData.featureNames[cited.records[0].features[1]]}<i>→</i>{caseData.featureNames[cited.records[1].features[0]]} + {caseData.featureNames[cited.records[1].features[1]]}</span>
            <span><small>MODEL</small>{MODEL_META[cited.records[0].model].label}<i>→</i>{MODEL_META[cited.records[1].model].label}</span>
          </div>
          <div className="endless-compare-metrics">
            <span><small>TRAIN</small><b>{Math.round(cited.records[0].train * 100)} → {Math.round(cited.records[1].train * 100)}%</b><em>{signedPoints(comparison.trainDelta)}</em></span>
            <span><small>FIELD</small><b>{Math.round(cited.records[0].test * 100)} → {Math.round(cited.records[1].test * 100)}%</b><em>{signedPoints(comparison.fieldDelta)}</em></span>
            <span><small>MIN RECALL</small><b>{Math.round(Math.min(cited.records[0].recall.cat, cited.records[0].recall.bread) * 100)} → {Math.round(Math.min(cited.records[1].recall.cat, cited.records[1].recall.bread) * 100)}%</b><em>{signedPoints(comparison.minRecallDelta)}</em></span>
            <span><small>ERRORS</small><b>{cited.records[0].errors} → {cited.records[1].errors}</b><em>{comparison.errorDelta > 0 ? '+' : ''}{comparison.errorDelta}</em></span>
          </div>
        </section>
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
        const causalResult = index > 0 ? causalPredictionResult(history[index - 1], record) : undefined
        return (
        <article key={record.id} data-delta={delta} className={selectedEvidenceIds.includes(record.id) ? 'evidence-selected' : ''}>
          <i>{String(record.id).padStart(2, '0')}</i>
          <span>{caseData.featureNames[record.features[0]]} + {caseData.featureNames[record.features[1]]}<small>{MODEL_META[record.model].label} · 最低召回 {Math.round(Math.min(record.recall.cat, record.recall.bread) * 100)}%</small><small className={`experiment-delta ${delta}`}>Δ {deltaLabel}</small></span>
          <b>{Math.round(record.train * 100)} → {Math.round(record.test * 100)}%</b>
          <em>
            <span>
              {record.predictionHit ? '现场预测✓' : '现场预测×'} · {record.reliable ? '可靠✓' : '可靠×'}
              {causalResult ? ` · 因果预测${causalResult.hit ? '✓' : '×'}：${causalResult.expected === 'improved' ? '应改善' : causalResult.expected === 'degraded' ? '应恶化' : causalResult.expected === 'material' ? '应明显变化' : '应基本不变'} → ${causalResult.observed === 'improved' ? '明显改善' : causalResult.observed === 'degraded' ? '明显恶化' : causalResult.observed === 'tradeoff' ? '指标冲突' : '基本不变'}` : ''}
            </span>
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
  falsificationReady,
  falsificationSummary,
  sourceSupportReady,
  sourceSupportContradicted,
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
  falsificationReady: boolean
  falsificationSummary?: string
  sourceSupportReady: boolean
  sourceSupportContradicted: boolean
  diagnosisAvailable: boolean
  attention?: boolean
  onChange: (value: EndlessSyndrome) => void
  onSubmit: () => void
  onEmergency: () => void
}) {
  const citedComparison = evidenceRecords.length === 2 ? discriminatingExperiment(evidenceRecords[0], evidenceRecords[1]) : undefined
  const expectedAxis = value ? diagnosisInterventionAxis(value) : undefined
  const evidenceMatchesDiagnosis = !expectedAxis || citedComparison?.axis === expectedAxis
  const citedAxisLabel = citedComparison?.axis === 'model' ? 'H-MODEL' : citedComparison?.axis === 'fields' ? 'H-FIELDS' : undefined
  const expectedAxisLabel = expectedAxis === 'model' ? 'H-MODEL' : expectedAxis === 'fields' ? 'H-FIELDS' : undefined
  return (
    <section className={`endless-diagnosis ${attention ? 'objective-focus' : ''}`}>
      <div className="endless-panel-head"><span>04 / DIAGNOSIS</span><strong>提交病因</strong></div>
      <p>先从实验日志引用两条能区分解释的单变量对照，再把它们写成病因判断。原样复现或同时改字段与模型，都不能说明究竟是哪一个因素改变了结果。</p>
      <div className={`diagnosis-evidence-packet ${evidenceReady && falsificationReady ? 'ready' : ''}`}>
        <small>引用证据</small>
        <strong>{evidenceRecords.length ? evidenceRecords.map((record) => `E${String(record.id).padStart(2, '0')}`).join(' + ') : '尚未建立证据包'}</strong>
        <span>{!evidenceReady
          ? '返回 EXPERIMENTS.LOG 选择两条有效记录。'
          : !falsificationReady
            ? '这组对照只有支持、没有独立反证。再用另一条干预轴做预注册 null test，或复核一份明确为 clear 的原因来源。'
            : !evidenceMatchesDiagnosis
              ? `当前引用实际支持 ${citedAxisLabel}，但你选择的病因需要 ${expectedAxisLabel} 的 material 因果支持。请更换诊断，或引用与该病因机制一致的单变量实验。`
              : !sourceSupportReady
                ? sourceSupportContradicted
                  ? '实验轴与诊断一致，但你已经复核过它声称的原因来源，而该来源明确为 CLEAR。这不是“还缺证据”，而是当前病因被直接反驳；请改掉病因判断。'
                  : '实验轴与诊断一致，但这项病因还缺少对应来源的正向事实。请回到 CASE LEADS 复核它声称的原因来源；不能只凭病因名称猜中结案。'
                : `这组支持证据已经配上独立反证：${falsificationSummary ?? '已记录'}。可以进入诊断。`}</span>
      </div>
      {caseData.diagnosis.options.map((option) => (
        <button
          type="button"
          key={option.id}
          className={value === option.id ? 'selected' : ''}
          disabled={!diagnosisAvailable || !evidenceReady || !falsificationReady}
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
