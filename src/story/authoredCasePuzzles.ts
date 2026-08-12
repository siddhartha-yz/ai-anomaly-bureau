import { STORY_CASE_002, STORY_CASE_003, type FormalCaseDefinition } from '../bureau/catalog'

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

export type AuthoredPuzzleStage = {
  id: string
  kicker: string
  title: string
  brief: string
  prompt: string
  actionLabel: string
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

export const AUTHORED_PUZZLE_CASES = {
  [STORY_CASE_002.id]: case002,
  [STORY_CASE_003.id]: case003,
} as const
