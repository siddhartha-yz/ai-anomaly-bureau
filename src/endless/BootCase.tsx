import { useMemo, useState } from 'react'
import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_META, MODEL_REGISTRY } from '../ml/registry'
import type { FeatureKey } from '../ml/types'
import { createEndlessCase, enumerateEndlessSolutions, type EndlessAuditResult } from './generator'
import { featureObservation } from './observables'

type BootRecord = {
  id: number
  features: [FeatureKey, FeatureKey]
  train: number
  audit: EndlessAuditResult
}

type DrillId = 'overfit' | 'imbalance' | 'shift'

type DrillDefinition = {
  code: string
  title: string
  evidence: string[]
  question: string
  options: Array<{ id: string; label: string; correct?: boolean }>
  takeaway: string
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function buildDrills(): Record<DrillId, DrillDefinition> {
  const overfitCase = createEndlessCase(6001)
  const overfitRecord = [...enumerateEndlessSolutions(overfitCase)]
    .sort((a, b) => (b.trainAccuracy - b.testAccuracy) - (a.trainAccuracy - a.testAccuracy))[0]

  const imbalanceCase = createEndlessCase(6003)
  const imbalanceRecord = enumerateEndlessSolutions(imbalanceCase)
    .find((item) => item.testAccuracy >= .85 && item.minRecall < .75)
    ?? enumerateEndlessSolutions(imbalanceCase).sort((a, b) => b.testAccuracy - a.testAccuracy || a.minRecall - b.minRecall)[0]

  const shiftCase = createEndlessCase(6002)
  const shiftFeatures = Object.keys(shiftCase.featureNames) as FeatureKey[]
  const movedFeature = [...shiftFeatures]
    .sort((a, b) => featureObservation(shiftCase, b).drift - featureObservation(shiftCase, a).drift)[0]
  const movedObservation = featureObservation(shiftCase, movedFeature)

  return {
    overfit: {
    code: 'TRAINING FILE A',
    title: '训练满分，现场反而掉下去',
    evidence: [
      `${MODEL_META[overfitRecord.model].label}：TRAIN ${percent(overfitRecord.trainAccuracy)} → FIELD ${percent(overfitRecord.testAccuracy)}`,
      `FIELD ERRORS ${overfitRecord.errorCount} · 最低类别召回 ${percent(overfitRecord.minRecall)}`,
      `档案系统同时标出了 ${overfitCase.archiveAlerts.length} 条采集质量告警`,
    ],
    question: '哪种解释更值得继续调查？',
    options: [
      { id: 'memorize', label: '模型可能把训练里的偶然噪声也记住了', correct: true },
      { id: 'perfect', label: '训练 100% 说明 A 一定更可靠' },
    ],
    takeaway: '不要把训练满分当成结案证据。真正要比较的是未知现场。',
  },
  imbalance: {
    code: 'TRAINING FILE B',
    title: `总体 ${percent(imbalanceRecord.testAccuracy)}，为什么仍然不能结案？`,
    evidence: [
      `FIELD ${percent(imbalanceRecord.testAccuracy)}`,
      `最低类别召回 ${percent(imbalanceRecord.minRecall)}`,
      `历史档案：${imbalanceCase.classNames.cat} ${imbalanceCase.train.filter((item) => item.label === 'cat').length} · ${imbalanceCase.classNames.bread} ${imbalanceCase.train.filter((item) => item.label === 'bread').length}`,
    ],
    question: '这份结果最大的风险是什么？',
    options: [
      { id: 'minority', label: '总体分掩盖了少数类一直漏掉', correct: true },
      { id: 'overall', label: `${percent(imbalanceRecord.testAccuracy)} 已经足够高，可以忽略分类别表现` },
    ],
    takeaway: '召回指“某一类真实样本里有多少被正确找出”。总体准确率只是摘要，稀少但重要的类别可能被它藏起来。',
  },
  shift: {
    code: 'TRAINING FILE C',
    title: '历史很好，换到现场却一起变了',
    evidence: [
      shiftCase.reportedFacts[0],
      `${shiftCase.featureNames[movedFeature]}：旧样本差异 ${movedObservation.separationLevel}/5`,
      `${shiftCase.featureNames[movedFeature]}：现场变化 ${movedObservation.driftLevel}/5`,
    ],
    question: '下一轮调查首先该确认什么？',
    options: [
      { id: 'environment', label: '训练环境和现场环境是不是已经不一样了', correct: true },
      { id: 'more-train', label: '只继续刷高历史训练分' },
    ],
    takeaway: '现场输入分布变了时，历史上好用的快捷线索可能已经失效。',
  },
  }
}

function score(caseData: ReturnType<typeof createEndlessCase>, features: [FeatureKey, FeatureKey]) {
  const points = projectSamples(caseData.train, features)
  const model = MODEL_REGISTRY.linear.fit(points)
  return evaluate(model, points).accuracy
}

function BootLog({ records, caseData }: { records: BootRecord[]; caseData: ReturnType<typeof createEndlessCase> }) {
  return (
    <section className="bootcase-log" aria-label="训练案件实验记录">
      <div className="bootcase-panel-head"><span>EXPERIMENTS.LOG</span><strong>{records.length}/2</strong></div>
      {records.map((record) => (
        <article key={record.id}>
          <i>{String(record.id).padStart(2, '0')}</i>
          <span>
            <b>{caseData.featureNames[record.features[0]]} + {caseData.featureNames[record.features[1]]}</b>
            <small>LINEAR · TRAIN {Math.round(record.train * 100)}%</small>
          </span>
          <strong>FIELD {Math.round(record.audit.accuracy * 100)}%</strong>
        </article>
      ))}
    </section>
  )
}

export function BootCase({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const caseData = useMemo(() => createEndlessCase(6000), [])
  const reliableLinear = useMemo(() => enumerateEndlessSolutions(caseData).find((item) => item.model === 'linear' && item.reliable), [caseData])
  const baselineFeatures: [FeatureKey, FeatureKey] = ['warmth', 'roundness']
  const repairFeatures = reliableLinear?.features ?? ['texture', 'aspect']
  const [phase, setPhase] = useState<'brief' | 'baseline' | 'contrast' | 'compare' | 'drills' | 'diagnose' | 'complete'>('brief')
  const [baselineTrained, setBaselineTrained] = useState(false)
  const [baselineAudit, setBaselineAudit] = useState<EndlessAuditResult>()
  const [contrastRun, setContrastRun] = useState(false)
  const [compareAnswer, setCompareAnswer] = useState<string>()
  const [compareLocked, setCompareLocked] = useState(false)
  const [drillIndex, setDrillIndex] = useState(0)
  const [drillAnswer, setDrillAnswer] = useState<string>()
  const [drillLocked, setDrillLocked] = useState(false)
  const [trainingDiagnosis, setTrainingDiagnosis] = useState<string>()
  const [diagnosisSubmitted, setDiagnosisSubmitted] = useState(false)

  const baselineTrain = score(caseData, baselineFeatures)
  const contrastTrain = score(caseData, repairFeatures)
  const contrastAudit = caseData.audit('linear', repairFeatures)
  const records: BootRecord[] = [
    ...(baselineAudit ? [{ id: 1, features: baselineFeatures, train: baselineTrain, audit: baselineAudit }] : []),
    ...(contrastRun ? [{ id: 2, features: repairFeatures, train: contrastTrain, audit: contrastAudit }] : []),
  ]
  const drillDefinitions = useMemo(() => buildDrills(), [])
  const drills = Object.keys(drillDefinitions) as DrillId[]
  const currentDrill = drillDefinitions[drills[drillIndex]]
  const drillCorrect = currentDrill.options.find((item) => item.id === drillAnswer)?.correct === true
  const phaseIndex = phase === 'brief' ? 0 : phase === 'baseline' ? 1 : phase === 'contrast' ? 2 : phase === 'compare' ? 3 : phase === 'drills' ? 4 : phase === 'diagnose' ? 5 : 6
  const mentorLine = phase === 'brief' ? '正式模式不会告诉你答案。这里先练一次“怎么设计实验”。'
    : phase === 'baseline' ? '第一条记录只是参照物，不是结论。'
      : phase === 'contrast' ? '控制变量：这次只换观察字段，模型保持不动。'
        : phase === 'compare' ? '先找两次实验哪里相同、哪里不同，再解释分数。'
          : phase === 'drills' ? '这些证据模式只在训练案件里讲。正式模式只给原始事实。'
            : phase === 'diagnose' ? '点一个病因只是写草稿；真正按下“提交诊断”才会锁定报告。'
              : '训练结束。以后我只报告状态，不替你选字段、模型或病因。'

  const runBaselineAudit = () => {
    setBaselineAudit(caseData.audit('linear', baselineFeatures))
  }

  const lockCompare = () => {
    if (!compareAnswer) return
    setCompareLocked(true)
  }

  const nextDrill = () => {
    if (!drillLocked || !drillCorrect) return
    if (drillIndex >= drills.length - 1) {
      setPhase('diagnose')
      return
    }
    setDrillIndex((value) => value + 1)
    setDrillAnswer(undefined)
    setDrillLocked(false)
  }

  return (
    <main className="bootcase-shell">
      <header className="bootcase-header">
        <div><small>TRAINING CASE 000 // CONTROLLED PRACTICE</small><h1>训练案件 000 · 学会怎么调查</h1></div>
        <button type="button" onClick={onBack}>退出训练</button>
      </header>

      <nav className="bootcase-progress" aria-label="训练案件进度">
        {['进入训练', '建立基线', '做对照', '读实验记录', '识别证据模式', '提交诊断', '完成'].map((label, index) => (
          <span key={label} className={index < phaseIndex ? 'done' : index === phaseIndex ? 'active' : ''}><i>{index < phaseIndex ? '✓' : String(index).padStart(2, '0')}</i>{label}</span>
        ))}
      </nav>

      <aside className="bootcase-xiaoxi"><b>析</b><span><small>XIAOXI // TRAINER</small>{mentorLine}</span></aside>

      {phase === 'brief' && (
        <section className="bootcase-stage bootcase-brief">
          <span>CASE 000 / 社团邮箱误杀</span>
          <h2>先学会一件事：不要追最高分，要设计能区分解释的实验。</h2>
          <p>社团报名邮件被大量丢进垃圾箱。技术组留下了一套旧方案，但没人知道问题出在观察字段还是判断规则。</p>
          <div className="bootcase-principle"><b>本训练案件会告诉你怎么读证据。</b><span>正式无尽模式不会再替你解释。</span></div>
          <button type="button" className="bootcase-primary" onClick={() => setPhase('baseline')}>▶ 复现旧方案</button>
        </section>
      )}

      {phase === 'baseline' && (
        <section className="bootcase-stage">
          <div className="bootcase-stage-copy">
            <small>STEP 01 / BASELINE</small><h2>先建立第一条实验记录</h2>
            <p>这次不要自己配。保持模型为直线分类器，复现旧方案的两个观察字段。</p>
          </div>
          <div className="bootcase-config">
            <article><small>X</small><strong>{caseData.featureNames[baselineFeatures[0]]}</strong></article>
            <article><small>Y</small><strong>{caseData.featureNames[baselineFeatures[1]]}</strong></article>
            <article><small>MODEL</small><strong>直线分类器</strong></article>
          </div>
          {!baselineTrained ? (
            <button type="button" className="bootcase-primary" onClick={() => setBaselineTrained(true)}>▶ 训练旧方案</button>
          ) : !baselineAudit ? (
            <div className="bootcase-result-row">
              <div><small>TRAIN</small><strong>{Math.round(baselineTrain * 100)}%</strong></div>
              <button type="button" className="bootcase-primary" onClick={runBaselineAudit}>▶ 运行第一次现场审计</button>
            </div>
          ) : (
            <>
              <BootLog records={records} caseData={caseData} />
              <div className="bootcase-teach"><strong>只有一条记录，还不能诊断。</strong><span>下一步做一个对照实验：模型保持不变，只换观察字段。</span></div>
              <button type="button" className="bootcase-primary" onClick={() => setPhase('contrast')}>▶ 建立对照实验</button>
            </>
          )}
        </section>
      )}

      {phase === 'contrast' && (
        <section className="bootcase-stage">
          <div className="bootcase-stage-copy"><small>STEP 02 / CONTROL ONE VARIABLE</small><h2>只改变一件事</h2><p>模型仍然保持直线分类器。技术组给出两个候选字段，我们只替换观察通道，看现场结果会不会明显变化。</p></div>
          <div className="bootcase-compare-config">
            <div><small>旧观察</small><b>{caseData.featureNames[baselineFeatures[0]]} + {caseData.featureNames[baselineFeatures[1]]}</b></div>
            <i>→</i>
            <div className="new"><small>只换字段</small><b>{caseData.featureNames[repairFeatures[0]]} + {caseData.featureNames[repairFeatures[1]]}</b></div>
            <em>MODEL = LINEAR / 不变</em>
          </div>
          {!contrastRun ? (
            <button type="button" className="bootcase-primary" onClick={() => setContrastRun(true)}>▶ 运行对照实验</button>
          ) : (
            <>
              <BootLog records={records} caseData={caseData} />
              <button type="button" className="bootcase-primary" onClick={() => setPhase('compare')}>▶ 比较两条记录</button>
            </>
          )}
        </section>
      )}

      {phase === 'compare' && (
        <section className="bootcase-stage bootcase-compare-question">
          <BootLog records={records} caseData={caseData} />
          <div className="bootcase-stage-copy"><small>STEP 03 / READ THE LOG</small><h2>两次实验之间，真正改变了什么？</h2><p>先找“变量”，再谈病因。不要只盯着最高的那个数字。</p></div>
          <div className="bootcase-answers">
            {[
              ['features', '只改变了观察字段'],
              ['model', '只改变了模型'],
              ['both', '字段和模型一起改变了'],
            ].map(([id, label]) => <button type="button" key={id} className={compareAnswer === id ? 'selected' : ''} disabled={compareLocked} onClick={() => setCompareAnswer(id)}>{label}</button>)}
          </div>
          {!compareLocked ? <button type="button" className="bootcase-primary" disabled={!compareAnswer} onClick={lockCompare}>锁定判断</button> : compareAnswer === 'features' ? (
            <div className="bootcase-feedback success"><strong>对。模型没变，现场表现却大幅变化。</strong><span>所以这组实验给了你“观察字段值得优先调查”的证据。这就是最简单的控制变量思路。</span><button type="button" onClick={() => setPhase('drills')}>▶ 再学三种常见证据模式</button></div>
          ) : (
            <div className="bootcase-feedback wrong"><strong>再看一次两条记录。</strong><span>两条记录都是 LINEAR。先比较每行的字段，而不是分数。</span><button type="button" onClick={() => { setCompareLocked(false); setCompareAnswer(undefined) }}>重新判断</button></div>
          )}
        </section>
      )}

      {phase === 'drills' && currentDrill && (
        <section className="bootcase-stage bootcase-drill">
          <div className="bootcase-stage-copy"><small>STEP 04 / {currentDrill.code}</small><h2>{currentDrill.title}</h2><p>这些是技术组留下的历史案例。这里只教你“该看哪些证据”，正式模式不会出现解释提示。</p></div>
          <div className="bootcase-evidence-cards">{currentDrill.evidence.map((line) => <article key={line}>{line}</article>)}</div>
          <h3>{currentDrill.question}</h3>
          <div className="bootcase-answers">{currentDrill.options.map((option) => <button type="button" key={option.id} className={drillAnswer === option.id ? 'selected' : ''} disabled={drillLocked} onClick={() => setDrillAnswer(option.id)}>{option.label}</button>)}</div>
          {!drillLocked ? <button type="button" className="bootcase-primary" disabled={!drillAnswer} onClick={() => setDrillLocked(true)}>锁定判断</button> : drillCorrect ? (
            <div className="bootcase-feedback success"><strong>判断成立。</strong><span>{currentDrill.takeaway}</span><button type="button" onClick={nextDrill}>{drillIndex === drills.length - 1 ? '▶ 完成训练案件' : '▶ 下一份训练记录'}</button></div>
          ) : (
            <div className="bootcase-feedback wrong"><strong>这份证据还不支持你的判断。</strong><span>不要猜术语，重新看数字之间的关系。</span><button type="button" onClick={() => { setDrillAnswer(undefined); setDrillLocked(false) }}>重新判断</button></div>
          )}
        </section>
      )}

      {phase === 'diagnose' && (
        <section className="bootcase-stage bootcase-training-diagnosis">
          <div className="bootcase-stage-copy"><small>STEP 05 / DIAGNOSIS REPORT</small><h2>现在把两条对照实验写成一份病因判断。</h2><p>回到训练案件本身：模型一直是 LINEAR，只换观察字段后，现场表现从 {Math.round((baselineAudit?.accuracy ?? 0) * 100)}% 变成 {Math.round(contrastAudit.accuracy * 100)}%。</p></div>
          <BootLog records={records} caseData={caseData} />
          <div className="bootcase-answers">
            <button type="button" className={trainingDiagnosis === 'feature-gap' ? 'selected' : ''} disabled={diagnosisSubmitted} onClick={() => setTrainingDiagnosis('feature-gap')}>旧方案的观察字段没有抓住真正稳定的差异</button>
            <button type="button" className={trainingDiagnosis === 'model-only' ? 'selected' : ''} disabled={diagnosisSubmitted} onClick={() => setTrainingDiagnosis('model-only')}>直线分类器本身完全不能处理这个任务</button>
          </div>
          {!diagnosisSubmitted ? (
            <>
              <div className="bootcase-draft-status">{trainingDiagnosis ? 'DRAFT READY / 你只是选中了一个草稿，还没有提交。' : 'DRAFT EMPTY / 先选择你要写进报告的病因。'}</div>
              <button type="button" className="bootcase-primary" disabled={!trainingDiagnosis} onClick={() => setDiagnosisSubmitted(true)}>提交训练诊断</button>
            </>
          ) : trainingDiagnosis === 'feature-gap' ? (
            <div className="bootcase-feedback success"><strong>报告成立。</strong><span>你不是因为“第二次分数高”就猜答案，而是因为模型不变、只换字段就让现场表现大幅变化。</span><button type="button" onClick={() => setPhase('complete')}>▶ 封存训练案件</button></div>
          ) : (
            <div className="bootcase-feedback wrong"><strong>这份报告解释不了对照实验。</strong><span>如果 LINEAR 本身完全不行，为什么只换字段后同一个 LINEAR 能在现场稳定？训练模式允许你立即重写；正式模式提交失败后需要新证据才能改口。</span><button type="button" onClick={() => { setTrainingDiagnosis(undefined); setDiagnosisSubmitted(false) }}>撤回训练草稿</button></div>
          )}
        </section>
      )}

      {phase === 'complete' && (
        <section className="bootcase-stage bootcase-complete">
          <span>TRAINING COMPLETE</span><h2>你现在知道正式无尽模式在要求什么了。</h2>
          <div className="bootcase-manual-preview">
            <strong>调查手册 / 核心方法</strong>
            <p>① 先建立基线。② 尽量一次只改一个因素。③ 先预测，再审计。④ 同方案复现不等于新区分证据。⑤ 病因必须能被多条不同配置的实验解释。</p>
          </div>
          <p>正式模式只会告诉你“下一步缺什么证据”，不会告诉你哪种解释正确。</p>
          <button type="button" className="bootcase-primary" onClick={onComplete}>▶ 进入正式无尽调查</button>
        </section>
      )}
    </main>
  )
}
