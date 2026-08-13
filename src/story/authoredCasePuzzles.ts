import { STORY_CASE_002, STORY_CASE_003, STORY_CASE_004, STORY_CASE_005, type FormalCaseDefinition } from '../bureau/catalog'

export type PuzzleMetric = {
  label: string
  value: string
  note?: string
  pass?: boolean
}

export type PuzzleOption = {
  id: string
  label: string
  detail: string
  resultTitle: string
  resultMetrics?: readonly PuzzleMetric[]
  resultNote: string
}

export type PuzzleEvidence = {
  title: string
  note?: string
  columns: readonly string[]
  rows: readonly (readonly string[])[]
}

export type AuthoredPuzzleStage = {
  id: string
  kicker: string
  title: string
  brief: string
  prompt: string
  actionLabel: string
  evidence?: PuzzleEvidence
  options: readonly PuzzleOption[]
  correctIds: readonly string[]
  success: string
}

export type AuthoredPuzzleConfig = {
  definition: FormalCaseDefinition
  stages: readonly AuthoredPuzzleStage[]
  closureTitle: string
  closureSummary: string
  takeaways: readonly string[]
}

type ScreeningSample = {
  urgent: boolean
  score: number
}

const CASE_002_SAMPLES: readonly ScreeningSample[] = [
  { urgent: true, score: .94 }, { urgent: true, score: .72 }, { urgent: true, score: .63 }, { urgent: true, score: .56 },
  ...[.84, .74, .70, .68, .65, .62, .59, .56, .54, .52, .50, .48, .46, .44, .42, .40, .38, .36,
    .34, .33, .32, .31, .30, .29, .28, .27, .26, .25, .24, .23, .22, .21, .20, .19, .18, .17, .16, .15,
    .14, .13, .12, .11, .10, .09, .08, .07, .06, .05, .04, .03].map((score) => ({ urgent: false, score })),
]

export type ScreeningMetrics = {
  threshold: number
  accuracy: number
  urgentRecall: number
  normalRecall: number
  falsePositives: number
  missedUrgent: number
}

export function evaluateScreeningThreshold(threshold: number): ScreeningMetrics {
  let correct = 0
  let urgentTotal = 0
  let urgentCaught = 0
  let normalTotal = 0
  let normalCorrect = 0
  let falsePositives = 0
  let missedUrgent = 0

  for (const sample of CASE_002_SAMPLES) {
    const predictedUrgent = sample.score >= threshold
    if (sample.urgent) {
      urgentTotal += 1
      if (predictedUrgent) {
        urgentCaught += 1
        correct += 1
      } else {
        missedUrgent += 1
      }
    } else {
      normalTotal += 1
      if (!predictedUrgent) {
        normalCorrect += 1
        correct += 1
      } else {
        falsePositives += 1
      }
    }
  }

  return {
    threshold,
    accuracy: correct / CASE_002_SAMPLES.length,
    urgentRecall: urgentCaught / urgentTotal,
    normalRecall: normalCorrect / normalTotal,
    falsePositives,
    missedUrgent,
  }
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function screeningMetrics(threshold: number): readonly PuzzleMetric[] {
  const result = evaluateScreeningThreshold(threshold)
  return [
    { label: '总体准确率', value: pct(result.accuracy), pass: result.accuracy >= .8 },
    { label: '优先病例召回', value: pct(result.urgentRecall), pass: result.urgentRecall >= .75 },
    { label: '普通病例召回', value: pct(result.normalRecall) },
    { label: '漏掉优先病例', value: String(result.missedUrgent), note: '4 例中' },
  ]
}

type ShiftSensor = 'brightness' | 'texture' | 'shape'
type ShiftLabel = 'staff' | 'visitor'

type ShiftSample = {
  label: ShiftLabel
  history: Record<ShiftSensor, number>
  field: Record<ShiftSensor, number>
}

const CASE_003_SAMPLES: readonly ShiftSample[] = [
  { label: 'staff', history: { brightness: .20, texture: .20, shape: .18 }, field: { brightness: .65, texture: .35, shape: .20 } },
  { label: 'staff', history: { brightness: .25, texture: .25, shape: .22 }, field: { brightness: .70, texture: .40, shape: .24 } },
  { label: 'staff', history: { brightness: .30, texture: .30, shape: .25 }, field: { brightness: .75, texture: .45, shape: .28 } },
  { label: 'staff', history: { brightness: .22, texture: .35, shape: .30 }, field: { brightness: .67, texture: .50, shape: .31 } },
  { label: 'staff', history: { brightness: .28, texture: .28, shape: .26 }, field: { brightness: .73, texture: .43, shape: .27 } },
  { label: 'staff', history: { brightness: .18, texture: .32, shape: .20 }, field: { brightness: .63, texture: .47, shape: .22 } },
  { label: 'visitor', history: { brightness: .75, texture: .65, shape: .72 }, field: { brightness: .60, texture: .60, shape: .70 } },
  { label: 'visitor', history: { brightness: .80, texture: .70, shape: .78 }, field: { brightness: .65, texture: .65, shape: .76 } },
  { label: 'visitor', history: { brightness: .70, texture: .75, shape: .68 }, field: { brightness: .55, texture: .70, shape: .69 } },
  { label: 'visitor', history: { brightness: .78, texture: .60, shape: .75 }, field: { brightness: .63, texture: .55, shape: .73 } },
  { label: 'visitor', history: { brightness: .72, texture: .68, shape: .70 }, field: { brightness: .57, texture: .63, shape: .71 } },
  { label: 'visitor', history: { brightness: .82, texture: .72, shape: .82 }, field: { brightness: .67, texture: .67, shape: .80 } },
]

export type ShiftSensorMetrics = {
  sensor: ShiftSensor
  threshold: number
  historyAccuracy: number
  fieldAccuracy: number
  minFieldRecall: number
}

export function evaluateShiftSensor(sensor: ShiftSensor): ShiftSensorMetrics {
  const staff = CASE_003_SAMPLES.filter((sample) => sample.label === 'staff')
  const visitors = CASE_003_SAMPLES.filter((sample) => sample.label === 'visitor')
  const staffMean = staff.reduce((sum, sample) => sum + sample.history[sensor], 0) / staff.length
  const visitorMean = visitors.reduce((sum, sample) => sum + sample.history[sensor], 0) / visitors.length
  const threshold = (staffMean + visitorMean) / 2
  const visitorHigh = visitorMean > staffMean
  const predict = (value: number): ShiftLabel => (visitorHigh ? value >= threshold : value <= threshold) ? 'visitor' : 'staff'

  const accuracy = (environment: 'history' | 'field') => {
    const correct = CASE_003_SAMPLES.filter((sample) => predict(sample[environment][sensor]) === sample.label).length
    return correct / CASE_003_SAMPLES.length
  }
  const recalls = (environment: 'history' | 'field') => (['staff', 'visitor'] as const).map((label) => {
    const rows = CASE_003_SAMPLES.filter((sample) => sample.label === label)
    return rows.filter((sample) => predict(sample[environment][sensor]) === label).length / rows.length
  })

  return {
    sensor,
    threshold,
    historyAccuracy: accuracy('history'),
    fieldAccuracy: accuracy('field'),
    minFieldRecall: Math.min(...recalls('field')),
  }
}

function shiftMetrics(sensor: ShiftSensor): readonly PuzzleMetric[] {
  const result = evaluateShiftSensor(sensor)
  return [
    { label: '历史验证', value: pct(result.historyAccuracy) },
    { label: '夜班现场', value: pct(result.fieldAccuracy), pass: result.fieldAccuracy >= .8 },
    { label: '最低类别召回', value: pct(result.minFieldRecall), pass: result.minFieldRecall >= .75 },
    { label: '固定判断阈值', value: result.threshold.toFixed(2), note: '由历史样本拟合' },
  ]
}


type LeakageLabel = 'recycle' | 'waste'
type LeakageSplit = 'record' | 'day' | 'entity'
type LeakageModel = 'identity' | 'stable' | 'camera'

type LeakageObject = {
  id: string
  label: LeakageLabel
  stable: number
  camera: number
}

const CASE_004_OBJECTS: readonly LeakageObject[] = [
  { id: 'obj-01', label: 'recycle', stable: .18, camera: .12 },
  { id: 'obj-02', label: 'recycle', stable: .22, camera: .18 },
  { id: 'obj-03', label: 'recycle', stable: .30, camera: .20 },
  { id: 'obj-04', label: 'recycle', stable: .34, camera: .27 },
  { id: 'obj-05', label: 'waste', stable: .68, camera: .72 },
  { id: 'obj-06', label: 'waste', stable: .74, camera: .78 },
  { id: 'obj-07', label: 'waste', stable: .80, camera: .84 },
  { id: 'obj-08', label: 'waste', stable: .62, camera: .70 },
  { id: 'obj-09', label: 'recycle', stable: .25, camera: .76 },
  { id: 'obj-10', label: 'recycle', stable: .31, camera: .72 },
  { id: 'obj-11', label: 'waste', stable: .70, camera: .24 },
  { id: 'obj-12', label: 'waste', stable: .77, camera: .30 },
  { id: 'obj-13', label: 'recycle', stable: .28, camera: .68 },
  { id: 'obj-14', label: 'recycle', stable: .58, camera: .74 },
  { id: 'obj-15', label: 'waste', stable: .66, camera: .20 },
  { id: 'obj-16', label: 'waste', stable: .73, camera: .26 },
]

const CASE_004_SPLITS: Record<LeakageSplit, { train: readonly string[]; validation: readonly string[] }> = {
  record: {
    train: CASE_004_OBJECTS.map((item) => item.id),
    validation: CASE_004_OBJECTS.map((item) => item.id),
  },
  day: {
    train: CASE_004_OBJECTS.slice(0, 12).map((item) => item.id),
    validation: CASE_004_OBJECTS.slice(8).map((item) => item.id),
  },
  entity: {
    train: CASE_004_OBJECTS.slice(0, 8).map((item) => item.id),
    validation: CASE_004_OBJECTS.slice(8).map((item) => item.id),
  },
}

export type LeakageSplitMetrics = {
  split: LeakageSplit
  identityOverlap: number
  validationAccuracy: number
  minValidationRecall: number
}

function recallFor(rows: readonly LeakageObject[], predict: (item: LeakageObject) => LeakageLabel, label: LeakageLabel) {
  const group = rows.filter((item) => item.label === label)
  return group.filter((item) => predict(item) === label).length / group.length
}

export function evaluateLeakageSplit(split: LeakageSplit): LeakageSplitMetrics {
  const spec = CASE_004_SPLITS[split]
  const trainIds = new Set(spec.train)
  const validation = spec.validation.map((id) => CASE_004_OBJECTS.find((item) => item.id === id)!)
  const overlap = validation.filter((item) => trainIds.has(item.id)).length / validation.length
  // The suspect model memorizes object identity whenever it has seen that physical
  // item before. Truly new objects fall back to the majority/default class.
  const predict = (item: LeakageObject): LeakageLabel => trainIds.has(item.id) ? item.label : 'recycle'
  const correct = validation.filter((item) => predict(item) === item.label).length / validation.length
  return {
    split,
    identityOverlap: overlap,
    validationAccuracy: correct,
    minValidationRecall: Math.min(
      recallFor(validation, predict, 'recycle'),
      recallFor(validation, predict, 'waste'),
    ),
  }
}

export type LeakageModelMetrics = {
  model: LeakageModel
  validationAccuracy: number
  minValidationRecall: number
}

export function evaluateLeakageModel(model: LeakageModel): LeakageModelMetrics {
  const train = CASE_004_OBJECTS.slice(0, 8)
  const validation = CASE_004_OBJECTS.slice(8)
  const means = (key: 'stable' | 'camera') => {
    const recycle = train.filter((item) => item.label === 'recycle')
    const waste = train.filter((item) => item.label === 'waste')
    const mean = (rows: readonly LeakageObject[]) => rows.reduce((sum, item) => sum + item[key], 0) / rows.length
    return { threshold: (mean(recycle) + mean(waste)) / 2, wasteHigh: mean(waste) > mean(recycle) }
  }
  const predict = (item: LeakageObject): LeakageLabel => {
    if (model === 'identity') return 'recycle'
    const key = model === 'stable' ? 'stable' : 'camera'
    const { threshold, wasteHigh } = means(key)
    const waste = wasteHigh ? item[key] >= threshold : item[key] <= threshold
    return waste ? 'waste' : 'recycle'
  }
  return {
    model,
    validationAccuracy: validation.filter((item) => predict(item) === item.label).length / validation.length,
    minValidationRecall: Math.min(
      recallFor(validation, predict, 'recycle'),
      recallFor(validation, predict, 'waste'),
    ),
  }
}

function leakageSplitMetrics(split: LeakageSplit): readonly PuzzleMetric[] {
  const result = evaluateLeakageSplit(split)
  return [
    { label: '验证物品身份重叠', value: pct(result.identityOverlap), pass: result.identityOverlap === 0 },
    { label: '嫌疑模型验证准确率', value: pct(result.validationAccuracy) },
    { label: '最低类别召回', value: pct(result.minValidationRecall) },
    { label: '切分单位', value: split === 'record' ? '照片记录' : split === 'day' ? '拍摄日期' : '物品实体' },
  ]
}

function leakageModelMetrics(model: LeakageModel): readonly PuzzleMetric[] {
  const result = evaluateLeakageModel(model)
  return [
    { label: '干净验证准确率', value: pct(result.validationAccuracy), pass: result.validationAccuracy >= .8 },
    { label: '最低类别召回', value: pct(result.minValidationRecall), pass: result.minValidationRecall >= .75 },
    { label: '验证身份重叠', value: '0%', pass: true },
    { label: '模型依赖', value: model === 'identity' ? '物品身份' : model === 'stable' ? '材料结构' : '相机位置' },
  ]
}

const case002: AuthoredPuzzleConfig = {
  definition: STORY_CASE_002,
  stages: [
    {
      id: 'split-metric',
      kicker: 'PRIMITIVE 01 / METRIC SPLIT',
      title: '92% 为什么仍然不安全？',
      brief: '54 份未知分诊记录里只有 4 份是真正的优先病例。当前系统总体准确率 93%，但事故报告说它连续漏掉优先病例。',
      prompt: '下一步应该把哪个仪表接入调查台？',
      actionLabel: '接入仪表',
      options: [
        { id: 'accuracy', label: '继续看总体准确率', detail: '把 54 个结果继续压成一个百分比。', resultTitle: '信息没有增加', resultNote: '总体分数仍然看不出少数病例到底发生了什么。' },
        { id: 'recall', label: '按类别拆开召回', detail: '分别看普通病例和优先病例有多少被找对。', resultTitle: '隐藏故障暴露', resultMetrics: screeningMetrics(.8), resultNote: '总体 93% 的同时，优先病例召回只有 25%。平均数把最重要的失败藏住了。' },
        { id: 'train', label: '再看训练分数', detail: '回到模型见过的旧记录确认训练表现。', resultTitle: '方向错误', resultNote: '事故发生在未知分诊记录；继续看训练分不能解释现场漏诊。' },
      ],
      correctIds: ['recall'],
      success: '新原语解锁：分类别召回。总体准确率不再是唯一目标。',
    },
    {
      id: 'threshold',
      kicker: 'PRIMITIVE 02 / THRESHOLD',
      title: '把一个数字变成真正的约束谜题',
      brief: '分诊站要求：总体准确率至少 80%，优先病例召回至少 75%。模型分数不变，你只能调整“多少分算优先”的阈值。',
      prompt: '选择一个阈值，运行一次未知审计。允许多试，但每次错误方案都会留下修正记录。',
      actionLabel: '运行未知审计',
      options: [
        { id: 't80', label: '阈值 0.80', detail: '非常保守，只把最高风险分数标成优先。', resultTitle: '总体漂亮，关键约束失败', resultMetrics: screeningMetrics(.8), resultNote: '总体准确率仍高，但优先病例召回远低于 75%。' },
        { id: 't60', label: '阈值 0.60', detail: '扩大优先处理范围，但仍尽量控制普通病例误报。', resultTitle: '约束同时满足', resultMetrics: screeningMetrics(.6), resultNote: '总体准确率仍有余量，优先病例召回刚好达到安全线。' },
        { id: 't55', label: '阈值 0.55', detail: '进一步扩大优先处理范围，接受更多普通病例误报。', resultTitle: '约束同时满足', resultMetrics: screeningMetrics(.55), resultNote: '牺牲了一些普通病例的准确判断，但优先病例全部找回，两项硬约束仍同时过线。' },
        { id: 't35', label: '阈值 0.35', detail: '进一步扩大优先范围，尽量不漏任何风险。', resultTitle: '召回很高，但误报淹没系统', resultMetrics: screeningMetrics(.35), resultNote: '优先病例几乎不会漏，但大量普通病例被误报，总体准确率跌破 80%。' },
      ],
      correctIds: ['t60', 't55'],
      success: '合法解不只一个：系统只检查风险约束，不要求猜中设计者心里的某个阈值。',
    },
    {
      id: 'transfer',
      kicker: 'COMPOSE / CASE 001 + CASE 002',
      title: '把两个案件的方法接起来',
      brief: 'CASE 001 已经告诉你“未知数据上的表现才算数”。这一案再加一层：未知表现也不能只压成一个总体数字。',
      prompt: '如果优先病例在现实中变得更稀少，下面哪件事最可能发生？',
      actionLabel: '锁定结论',
      options: [
        { id: 'accuracy-up', label: '总体准确率可能更高，但系统反而更危险', detail: '多数普通病例更容易把平均数撑起来。', resultTitle: '推理成立', resultNote: '类别越不平衡，总体准确率越可能掩盖少数类失败，所以必须继续看分类别召回。' },
        { id: 'accuracy-trust', label: '总体准确率越高，就越能证明少数病例安全', detail: '平均分数会自动代表每一类。', resultTitle: '结论不成立', resultNote: '总体准确率不会自动保证每一类都表现可靠。' },
        { id: 'training', label: '只要训练集类别平衡，现场就不会有问题', detail: '训练比例可以替代未知审计。', resultTitle: '证据不足', resultNote: '现场比例与未知表现仍需要实际审计，不能从训练集直接推出。' },
      ],
      correctIds: ['accuracy-up'],
      success: 'CASE 002 证据链完成：未知审计 → 分类别召回 → 阈值取舍 → 类别不平衡。',
    },
  ],
  closureTitle: '被平均数藏起来的人重新出现了',
  closureSummary: '你把一个“92% 看起来很好”的系统拆成了类别级行为，并用阈值实验满足真正的安全约束。',
  takeaways: ['总体 Accuracy 可能掩盖少数类失败', '召回回答“这一类真实样本找回了多少”', '阈值改变误报与漏报的取舍', '指标目标必须来自真实风险，而不是越高越好'],
}

const case003: AuthoredPuzzleConfig = {
  definition: STORY_CASE_003,
  stages: [
    {
      id: 'context',
      kicker: 'PRIMITIVE 03 / ENVIRONMENT',
      title: '同一个模型，为什么天黑就坏？',
      brief: '当前门禁只用“画面亮度”作为观察通道。历史白天验证 100%，夜班现场却只有 50%，最低类别召回为 0%。判断规则和阈值都没有改。',
      prompt: '在换模型之前，哪份事实最值得先接入调查？',
      actionLabel: '调取证据',
      options: [
        { id: 'context', label: '历史 / 夜班采集条件', detail: '检查照明、曝光和摄像环境是否发生变化。', resultTitle: '环境差异确认', resultMetrics: shiftMetrics('brightness'), resultNote: '白天样本来自稳定顶灯；夜班切到低照度补光。亮度分布整体移动，但模型仍沿用白天阈值。' },
        { id: 'bigger-model', label: '先换更复杂的模型', detail: '让模型增加更多规则，暂时不检查输入变化。', resultTitle: '因果链断开', resultNote: '模型没有变化却突然在夜班崩掉，先检查输入世界发生了什么更直接。' },
        { id: 'train-score', label: '继续确认白天训练分', detail: '重复证明历史环境里它确实表现很好。', resultTitle: '重复旧证据', resultNote: '白天高分已经确认；重复它不能解释夜班为何失败。' },
      ],
      correctIds: ['context'],
      success: '新原语解锁：环境不是背景文字，而是模型输入分布的一部分。',
    },
    {
      id: 'stable-sensor',
      kicker: 'COMPOSE / CONTROLLED CHANGE',
      title: '保持判断规则不变，只换一只“眼睛”',
      brief: '固定同一种一维阈值分类器，阈值仍只由历史样本拟合。你可以改用不同观察通道，再同时检查历史与夜班表现。可靠要求：夜班总体 ≥80%，最低类别召回 ≥75%。',
      prompt: '选择观察通道并运行审计。这里允许不止一种可靠解。',
      actionLabel: '只换观察通道并审计',
      options: [
        { id: 'brightness', label: '画面亮度', detail: '继续使用白天区分非常明显的旧线索。', resultTitle: '历史完美，夜班崩溃', resultMetrics: shiftMetrics('brightness'), resultNote: '这个线索在历史环境里很强，但夜班整体漂移后不再稳定。' },
        { id: 'texture', label: '局部纹理', detail: '换成受照明影响较小的局部结构。', resultTitle: '跨环境基本稳定', resultMetrics: shiftMetrics('texture'), resultNote: '历史区分仍然清楚，夜班只出现轻微下降，两个类别都保持可用。' },
        { id: 'shape', label: '轮廓比例', detail: '换成几何结构线索，保持模型与训练方式不变。', resultTitle: '跨环境稳定', resultMetrics: shiftMetrics('shape'), resultNote: '同一个简单判断规则在白天和夜班都保持稳定，说明修复来自观察信息而不是模型变复杂。' },
      ],
      correctIds: ['texture', 'shape'],
      success: '你做成了一次真正的控制变量实验：模型不变，只替换观察通道。',
    },
    {
      id: 'causal-reading',
      kicker: 'COMPOSE / CASE 001 + 002 + 003',
      title: '现在解释“为什么修好了”',
      brief: '旧亮度线索：白天 100% → 夜班 50%。稳定结构线索：白天高分 → 夜班也高分。两次审计都继续看最低类别召回，而不只看总体 Accuracy。',
      prompt: '这组证据最支持哪一个解释？',
      actionLabel: '提交因果解释',
      options: [
        { id: 'shift', label: '历史环境里的亮度捷径在夜班发生了分布变化', detail: '换成跨环境稳定的结构线索后，同一个简单模型恢复。', resultTitle: '因果链闭合', resultNote: '这就是分布变化：模型面对的输入世界改变了，历史上有效的线索不再保持原来的关系。' },
        { id: 'complexity', label: '原模型一定太简单，所以夜班才失败', detail: '复杂度不足可以解释所有环境变化。', resultTitle: '与实验冲突', resultNote: '模型没有变，只换观察通道就恢复，说明“模型太简单”不是这组证据最直接的解释。' },
        { id: 'random', label: '夜班只是随机倒霉，多测几次自然会恢复', detail: '不需要解释环境与输入变化。', resultTitle: '忽略了系统性证据', resultNote: '夜班错误与环境切换同步出现，而且换稳定线索后持续恢复，不像一次随机波动。' },
      ],
      correctIds: ['shift'],
      success: 'CASE 003 证据链完成：未知审计 → 分类别指标 → 环境变化 → 控制变量 → 稳定特征。',
    },
  ],
  closureTitle: '夜班不再是模型的盲区',
  closureSummary: '你没有用更复杂的模型覆盖问题，而是找到了一个只在旧环境成立的捷径，并用跨环境稳定线索替换它。',
  takeaways: ['输入环境变化会让旧相关性失效', '训练/历史高分不能代表新环境', '保持模型不变、只换观察通道可以建立更清楚的因果证据', '跨环境稳定性需要同时检查总体表现与分类别召回'],
}


const case004: AuthoredPuzzleConfig = {
  definition: STORY_CASE_004,
  stages: [
    {
      id: 'provenance',
      kicker: 'PRIMITIVE 04 / SPLIT PROVENANCE',
      title: '这个“验证集”真的没见过吗？',
      brief: '分拣站把同一件物品连续拍了多张照片，再随机按照片记录切训练 / 验证。离线验证 100%，但新到站物品只有约一半能分对。',
      prompt: '哪一个 ENTITY 同时出现在 TRAIN 和 VALIDATION？',
      actionLabel: '检查切分记录',
      evidence: {
        title: 'SPLIT_LEDGER / 抽样切分台账',
        note: '文件 ID 不同；ENTITY 才代表现实中的同一件物品。',
        columns: ['FILE', 'ENTITY', 'SPLIT'],
        rows: [
          ['img-1041', 'OBJ-09', 'TRAIN'],
          ['img-1048', 'OBJ-10', 'TRAIN'],
          ['img-1056', 'OBJ-11', 'TRAIN'],
          ['img-1062', 'OBJ-12', 'TRAIN'],
          ['img-2203', 'OBJ-09', 'VALIDATION'],
          ['img-2207', 'OBJ-13', 'VALIDATION'],
          ['img-2214', 'OBJ-14', 'VALIDATION'],
          ['img-2221', 'OBJ-15', 'VALIDATION'],
        ],
      },
      options: [
        { id: 'obj-09', label: 'OBJ-09', detail: '逐行核对它在 TRAIN 与 VALIDATION 中是否都出现。', resultTitle: '抓到跨 split 的同一实体', resultMetrics: leakageSplitMetrics('record'), resultNote: 'OBJ-09 的不同照片分别进入训练和验证。继续扫描完整台账后发现这不是孤例：记录级随机切分让验证物品身份与训练集 100% 重叠。' },
        { id: 'obj-10', label: 'OBJ-10', detail: '检查它是否同时出现在两侧。', resultTitle: '没有形成跨 split 证据', resultNote: '这份抽样里 OBJ-10 只出现在 TRAIN。它不能证明验证集已经见过同一件物品。' },
        { id: 'obj-14', label: 'OBJ-14', detail: '检查它是否同时出现在两侧。', resultTitle: '没有形成跨 split 证据', resultNote: '这份抽样里 OBJ-14 只出现在 VALIDATION。它本身是未知实体，不构成泄漏证据。' },
        { id: 'img-1041', label: 'img-1041', detail: '按文件 ID 寻找重复记录。', resultTitle: '查错了切分单位', resultNote: '文件 ID 没有重复，但同一实体可以产生多个不同文件。只比较文件名正是这次泄漏会被漏掉的原因。' },
      ],
      correctIds: ['obj-09'],
      success: '你不是被系统告知“有泄漏”，而是从原始台账里抓到了它。新原语解锁：切分单位。验证文件不同，不代表验证对象真的独立。',
    },
    {
      id: 'resplit',
      kicker: 'CONTROLLED CHANGE / SPLIT ONLY',
      title: '只改切分规则，不改模型',
      brief: '保持嫌疑模型、特征和训练方式不变，只重新定义训练 / 验证怎么切。真正要上线的是“从未见过的新物品”，所以验证也必须模拟这个部署单位。',
      prompt: '选择一种重切分方式，重新运行验证。',
      actionLabel: '重切分并验证',
      options: [
        { id: 'record', label: '继续随机按照片记录切分', detail: '不同照片可以来自同一件物品。', resultTitle: '满分幻觉继续存在', resultMetrics: leakageSplitMetrics('record'), resultNote: '验证仍然 100% 身份重叠；满分没有提供新物品泛化证据。' },
        { id: 'day', label: '按拍摄日期切分', detail: '后一天的照片进验证，但部分物品跨天重复出现。', resultTitle: '泄漏减少，但没有消失', resultMetrics: leakageSplitMetrics('day'), resultNote: '验证分下降到 75%，但仍有一半验证物品在训练里出现过，评估继续被污染。' },
        { id: 'entity', label: '按物品实体分组切分', detail: '同一件物品的所有照片只能出现在同一侧。', resultTitle: '真正的失败终于暴露', resultMetrics: leakageSplitMetrics('entity'), resultNote: '身份重叠降到 0%，嫌疑模型马上跌到 50%，且一类召回归零。现在验证终于像真实上线。' },
      ],
      correctIds: ['entity'],
      success: '你完成了切分层的控制变量实验：模型没变，只有“什么算未知”变了。',
    },
    {
      id: 'clean-model',
      kicker: 'COMPOSE / CLEAN SPLIT + MODEL',
      title: '在干净验证集上，谁真的学会了规律？',
      brief: '现在所有验证物品都从未出现在训练里。可靠要求仍沿用 CASE 002：总体 ≥80%，最低类别召回 ≥75%。只在这份干净验证集上比较候选模型。',
      prompt: '选择一个候选模型并审计。',
      actionLabel: '运行干净验证',
      options: [
        { id: 'identity', label: '身份记忆器', detail: '优先利用训练里见过的物品身份；陌生物品回退到默认类别。', resultTitle: '记忆无法迁移', resultMetrics: leakageModelMetrics('identity'), resultNote: '没有身份重叠后，原来的“满分模型”退化到猜多数类，一类召回直接归零。' },
        { id: 'stable', label: '材料结构分类器', detail: '只用跨物品可复用的材料结构分数，阈值由训练物品拟合。', resultTitle: '跨实体保持可靠', resultMetrics: leakageModelMetrics('stable'), resultNote: '面对从未见过的物品仍达到 88% 左右，并同时守住两个类别的召回下限。' },
        { id: 'camera', label: '相机位置分类器', detail: '利用训练阶段很强的拍摄机位相关性。', resultTitle: '又一个捷径', resultMetrics: leakageModelMetrics('camera'), resultNote: '新物品批次更换机位后相关性反转。这个方案重复了 CASE 003 的环境捷径问题。' },
      ],
      correctIds: ['stable'],
      success: '干净验证集把“记住训练世界”和“学到可迁移规律”真正分开了。',
    },
    {
      id: 'compose',
      kicker: 'COMPOSE / CASE 001 + 002 + 003 + 004',
      title: '最后定义：什么才算“未知验证”？',
      brief: 'CASE 001 说未知样本才算数；CASE 002 说未知表现要拆类别；CASE 003 说未知环境也可能改变；CASE 004 再补上一层：验证对象本身不能偷偷和训练对象重合。',
      prompt: '哪条规则最适合以后设计验证集？',
      actionLabel: '封存评估规则',
      options: [
        { id: 'deployment-unit', label: '按真实部署中的“新对象单位”隔离训练与验证', detail: '新病人、新用户、新设备、新物品，都应按实际泛化单位分组。', resultTitle: '证据链闭合', resultNote: '验证集的独立性不是文件层面的，而是部署语义层面的。切分单位必须对应模型上线后真正会遇到的“新”。' },
        { id: 'random-files', label: '只要文件随机打散，就一定是独立验证', detail: '不同文件名足以保证模型没见过。', resultTitle: '与本案冲突', resultNote: '同一实体可以产生很多不同文件；随机文件切分正是这次泄漏的来源。' },
        { id: 'highest-score', label: '选验证分最高的切分方式', detail: '验证越高越说明切分越科学。', resultTitle: '目标倒置', resultNote: '评估的目的不是制造高分，而是逼近真实部署的不确定性。' },
      ],
      correctIds: ['deployment-unit'],
      success: 'CASE 004 证据链完成：未知审计 → 切分单位 → 泄漏暴露 → 分组验证 → 真正泛化。',
    },
  ],
  closureTitle: '满分验证终于失去了伪装',
  closureSummary: '你没有靠调参挽救一个漂亮数字，而是先修正“什么算未知”，再让模型在真正独立的对象上证明自己。',
  takeaways: ['验证集和训练集必须在部署语义上独立', '同一实体的多条记录跨 split 会造成数据泄漏', '按实体分组切分能暴露身份记忆型模型', '评估设计本身也是实验系统的一部分'],
}


type CalibrationBucket = { score: number; count: number; positives: number }
const CASE_005_CALIBRATION_BUCKETS: readonly CalibrationBucket[] = [
  { score: .2, count: 10, positives: 1 },
  { score: .4, count: 10, positives: 3 },
  { score: .6, count: 10, positives: 7 },
  { score: .8, count: 10, positives: 9 },
]

// Deliberately separate from the calibration split above. The fitted mapping is
// allowed to generalize imperfectly here; CASE 004's validation-independence rule
// must still hold when CASE 005 introduces probability calibration.
const CASE_005_AUDIT_BUCKETS: readonly CalibrationBucket[] = [
  { score: .2, count: 25, positives: 2 },
  { score: .4, count: 25, positives: 9 },
  { score: .6, count: 25, positives: 17 },
  { score: .8, count: 25, positives: 23 },
]

type CalibrationStrategy = 'raw' | 'calibrated' | 'hard'
const CALIBRATION_MAP: Record<CalibrationStrategy, Record<string, number>> = {
  raw: { '.2': .2, '.4': .4, '.6': .6, '.8': .8 },
  calibrated: { '.2': .1, '.4': .3, '.6': .7, '.8': .9 },
  hard: { '.2': 0, '.4': 0, '.6': 1, '.8': 1 },
}

export function evaluateCalibration(strategy: CalibrationStrategy) {
  const total = CASE_005_AUDIT_BUCKETS.reduce((sum, bucket) => sum + bucket.count, 0)
  let ece = 0
  let brier = 0
  for (const bucket of CASE_005_AUDIT_BUCKETS) {
    const probability = CALIBRATION_MAP[strategy][String(bucket.score).replace(/^0/, '')]
    const observedRate = bucket.positives / bucket.count
    ece += bucket.count / total * Math.abs(probability - observedRate)
    brier += (bucket.positives * (1 - probability) ** 2 + (bucket.count - bucket.positives) * probability ** 2) / total
  }
  return { ece, brier }
}

function calibrationMetrics(strategy: CalibrationStrategy): readonly PuzzleMetric[] {
  const result = evaluateCalibration(strategy)
  return [
    { label: '校准误差 ECE', value: pct(result.ece), pass: result.ece <= .05 },
    { label: 'Brier 误差', value: result.brier.toFixed(2), pass: result.brier <= .15 + Number.EPSILON },
    { label: '排序', value: strategy === 'hard' ? '被压成两档' : '保持不变', pass: strategy !== 'hard' },
  ]
}

function decisionMetrics(strategy: 'raw-policy' | 'calibrated-policy' | 'lower-raw-threshold'): readonly PuzzleMetric[] {
  const probabilities = strategy === 'calibrated-policy' ? CALIBRATION_MAP.calibrated : CALIBRATION_MAP.raw
  const threshold = strategy === 'lower-raw-threshold' ? .55 : .65
  let treated = 0
  let caught = 0
  const positives = CASE_005_AUDIT_BUCKETS.reduce((sum, bucket) => sum + bucket.positives, 0)
  const total = CASE_005_AUDIT_BUCKETS.reduce((sum, bucket) => sum + bucket.count, 0)
  for (const bucket of CASE_005_AUDIT_BUCKETS) {
    const probability = probabilities[String(bucket.score).replace(/^0/, '')]
    if (probability >= threshold) {
      treated += bucket.count
      caught += bucket.positives
    }
  }
  return [
    { label: '政策风险阈值', value: strategy === 'lower-raw-threshold' ? '被偷偷改成 55%' : '保持 65%', pass: strategy !== 'lower-raw-threshold' },
    { label: '高风险召回', value: pct(caught / positives), pass: caught / positives >= .75 },
    { label: '需要干预', value: `${treated} / ${total}` },
  ]
}

const case005: AuthoredPuzzleConfig = {
  definition: STORY_CASE_005,
  stages: [
    {
      id: 'reliability',
      kicker: 'PRIMITIVE 05 / PROBABILITY MEANING',
      title: '“60% 风险”真的意味着十个人里六个吗？',
      brief: '模型仍能把更危险的人排在更前面，但医生要用输出概率做处置。先看独立审计中的可靠性表：每一行都是 25 名此前未参与训练或校准的病人。',
      prompt: '这张表最直接暴露了什么？',
      actionLabel: '读取可靠性表',
      evidence: {
        title: 'RELIABILITY_TABLE / 独立审计',
        note: 'CONFIDENCE 是模型输出；OBSERVED 是这一档里真实恶化的频率。',
        columns: ['CONFIDENCE', 'PATIENTS', 'OBSERVED'],
        rows: [['20%', '25', '8%'], ['40%', '25', '36%'], ['60%', '25', '68%'], ['80%', '25', '92%']],
      },
      options: [
        { id: 'miscalibrated', label: '排序仍有用，但这些数字不能直接当真实发生概率', detail: '比较每个 confidence bucket 与实际频率，而不是只看谁排在前面。', resultTitle: '概率语义失真', resultMetrics: calibrationMetrics('raw'), resultNote: '总体 ECE 为 9%，而且低风险端偏高估、高风险端偏低估。分类排序可以仍然有用，但“0.8 = 80% 会发生”并不成立。' },
        { id: 'ranking-broken', label: '模型连风险排序也完全反了', detail: '如果排序反了，分数越高应该越不危险。', resultTitle: '与表格不符', resultNote: '真实恶化率仍随模型分数升高而升高：8% → 36% → 68% → 92%。坏的是概率刻度，不是排序方向。' },
        { id: 'accuracy-only', label: '只要最终分类准确率够高，概率偏一点无所谓', detail: '分类正确就足以支持所有后续决策。', resultTitle: '混淆了两种任务', resultNote: '当下游规则明确写“风险 ≥65% 才干预”时，概率本身就是决策输入。分类对不等于概率可信。' },
      ],
      correctIds: ['miscalibrated'],
      success: '新原语解锁：校准。一个 70% 的概率如果长期可信，应当在许多相似样本中大约七成发生。',
    },
    {
      id: 'calibrate',
      kicker: 'CONTROLLED CHANGE / SCALE ONLY',
      title: '保持排序不变，只修正概率刻度',
      brief: 'CASE 004 的规则继续生效：下面这份 CALIBRATION split 只负责拟合映射；上一页那 100 名审计病人从未参与拟合。不要为了概率好看重新训练分类器。',
      prompt: '选择一种概率输出方案，在同一批独立审计样本上比较。',
      actionLabel: '运行校准审计',
      evidence: {
        title: 'CALIBRATION_SPLIT / 仅用于拟合',
        note: '这 40 名病人与最终审计集完全分离。只用 RAW SCORE 与 OBSERVED 决定映射；最终输出要由你先选方案，再去独立审计集验证。',
        columns: ['RAW SCORE', 'PATIENTS', 'OBSERVED'],
        rows: CASE_005_CALIBRATION_BUCKETS.map((bucket) => [pct(bucket.score), String(bucket.count), pct(bucket.positives / bucket.count)]),
      },
      options: [
        { id: 'raw', label: '继续使用原始 0.2 / 0.4 / 0.6 / 0.8', detail: '排序不变，概率也完全不修。', resultTitle: '排序还在，刻度仍偏', resultMetrics: calibrationMetrics('raw'), resultNote: '独立审计 ECE 仍为 9%。这不是分类失败，而是概率输出仍不适合承担风险语义。' },
        { id: 'calibrated', label: '让每档输出贴近校准集中的真实发生频率，并保持单调', detail: '只根据这 40 人拟合概率刻度；冻结映射后再去独立审计集验收。', resultTitle: '概率刻度明显改善', resultMetrics: calibrationMetrics('calibrated'), resultNote: '你从校准集得到 10% / 30% / 70% / 90% 的单调映射；到了另一批审计病人上 ECE 仍从 9% 降到 3%，Brier 也改善。没有追求“审计集 0 误差”，因为那会重新制造数据泄漏。' },
        { id: 'hard', label: '把低两档改成 0%，高两档改成 100%', detail: '让模型显得更“确定”。', resultTitle: '更自信，不等于更可信', resultMetrics: calibrationMetrics('hard'), resultNote: '概率被压成极端值后 ECE 和 Brier 都更差。校准不是把输出推向 0/1。' },
      ],
      correctIds: ['calibrated'],
      success: '你只改了概率刻度，没有偷换分类器、排序或验证对象，也没有拿审计集反向调映射。CASE 004 的独立验证原则被真正复用到了校准。',
    },
    {
      id: 'policy',
      kicker: 'COMPOSE / CALIBRATION + THRESHOLD',
      title: '风险阈值应该改，还是概率应该先可信？',
      brief: '医院政策由处置成本确定：估计真实恶化风险 ≥65% 才进入干预。校准映射已经在上一关冻结；现在只能把它应用到独立审计，不能再看结果改映射或偷改政策阈值。',
      prompt: '根据冻结的概率映射，怎样执行既定 65% 风险政策？',
      actionLabel: '执行处置策略',
      evidence: {
        title: 'FROZEN_CALIBRATION / POLICY CARD',
        note: '映射来自独立 CALIBRATION split，已冻结。政策阈值来自处置成本，不是模型调参旋钮。',
        columns: ['RAW SCORE', 'CALIBRATED RISK'],
        rows: [
          ['20%', '10%'],
          ['40%', '30%'],
          ['60%', '70%'],
          ['80%', '90%'],
        ],
      },
      options: [
        { id: 'raw-policy', label: '原始概率直接套 65% 阈值', detail: '仍把未经校准的输出当真实风险。', resultTitle: '漏掉一整档真实高风险病人', resultMetrics: decisionMetrics('raw-policy'), resultNote: '原始 60% 档没有进入干预，但独立审计里这一档已有 68% 恶化。高风险召回只有 45%。' },
        { id: 'calibrated-policy', label: '先校准概率，再保持 65% 政策阈值', detail: '让风险数字先恢复语义，再按既定成本规则行动。', resultTitle: '概率与决策重新对齐', resultMetrics: decisionMetrics('calibrated-policy'), resultNote: '校准后的 70% 档会被纳入干预，高风险召回提升到 78%，同时政策阈值没有被偷偷改写。' },
        { id: 'lower-raw-threshold', label: '不校准，直接把原始阈值降到 55%', detail: '通过调按钮碰巧把 60% 档也纳入。', resultTitle: '动作碰巧一样，语义却坏了', resultMetrics: decisionMetrics('lower-raw-threshold'), resultNote: '这批数据上处置结果碰巧与校准方案相同，但你已经把“65% 真实风险政策”偷换成“55% 模型分数”。换模型或环境后这个数字没有可迁移含义。' },
      ],
      correctIds: ['calibrated-policy'],
      success: 'CASE 005 证据链完成：未知审计 → 可靠性表 → 独立校准 → 保持排序 → 概率阈值决策。',
    },
  ],
  closureTitle: '80% 终于重新表示 80%',
  closureSummary: '你没有靠更高 Accuracy 掩盖问题，也没有随手重调阈值，而是先让概率恢复可解释的频率含义，再让既定风险政策作用在可信概率上。',
  takeaways: ['分类排序正确不等于概率已经校准', '概率校准要在独立数据上拟合并再次审计', '校准可以保持排序不变，只修正概率刻度', '决策阈值描述政策成本；模型分数只有校准后才适合直接解释成风险概率'],
}

export const AUTHORED_PUZZLE_CASES = {
  [STORY_CASE_002.id]: case002,
  [STORY_CASE_003.id]: case003,
  [STORY_CASE_004.id]: case004,
  [STORY_CASE_005.id]: case005,
} as const
