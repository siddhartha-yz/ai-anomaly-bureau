export type LabLevel = 1 | 2 | 3
export type LabTool = 'test-probe' | 'class-probe' | 'environment-switch'
export type LevelOneFeature = 'appearance' | 'structure'
export type ShiftFeature = 'brightness' | 'texture' | 'shape'
export type ShiftEnvironment = 'day' | 'night'

export type LabMetric = {
  id: string
  label: string
  value: number
  target?: number
  higherIsBetter?: boolean
}

export type ScreeningMetrics = {
  threshold: number
  accuracy: number
  urgentRecall: number
  normalRecall: number
  falsePositives: number
  missedUrgent: number
}

export type ShiftMetrics = {
  feature: ShiftFeature
  environment: ShiftEnvironment
  accuracy: number
  minRecall: number
}

export const levelOneFeatureLabels: Record<LevelOneFeature, string> = {
  appearance: '亮度 + 圆度',
  structure: '纹理 + 比例',
}

export const shiftFeatureLabels: Record<ShiftFeature, string> = {
  brightness: '画面亮度',
  texture: '局部纹理',
  shape: '轮廓比例',
}

const LEVEL_ONE_METRICS: Record<LevelOneFeature, { train: number; field: number }> = {
  appearance: { train: 1, field: 0.61 },
  structure: { train: 0.92, field: 0.88 },
}

export function evaluateLevelOne(feature: LevelOneFeature) {
  return LEVEL_ONE_METRICS[feature]
}

type ScreeningSample = { urgent: boolean; score: number }

const SCREENING_SAMPLES: readonly ScreeningSample[] = [
  { urgent: true, score: .94 }, { urgent: true, score: .72 }, { urgent: true, score: .63 }, { urgent: true, score: .56 },
  ...[.84, .74, .70, .68, .65, .62, .59, .56, .54, .52, .50, .48, .46, .44, .42, .40, .38, .36,
    .34, .33, .32, .31, .30, .29, .28, .27, .26, .25, .24, .23, .22, .21, .20, .19, .18, .17, .16, .15,
    .14, .13, .12, .11, .10, .09, .08, .07, .06, .05, .04, .03].map((score) => ({ urgent: false, score })),
]

export const screeningScoreRail = SCREENING_SAMPLES.map((sample, index) => ({
  id: `${sample.urgent ? 'u' : 'n'}-${index}`,
  urgent: sample.urgent,
  score: sample.score,
}))

export function evaluateScreening(threshold: number): ScreeningMetrics {
  let correct = 0
  let urgentTotal = 0
  let urgentCaught = 0
  let normalTotal = 0
  let normalCorrect = 0
  let falsePositives = 0
  let missedUrgent = 0

  for (const sample of SCREENING_SAMPLES) {
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
    accuracy: correct / SCREENING_SAMPLES.length,
    urgentRecall: urgentCaught / urgentTotal,
    normalRecall: normalCorrect / normalTotal,
    falsePositives,
    missedUrgent,
  }
}

type ShiftLabel = 'staff' | 'visitor'
type ShiftSample = {
  label: ShiftLabel
  day: Record<ShiftFeature, number>
  night: Record<ShiftFeature, number>
}

const SHIFT_SAMPLES: readonly ShiftSample[] = [
  { label: 'staff', day: { brightness: .20, texture: .20, shape: .18 }, night: { brightness: .65, texture: .35, shape: .20 } },
  { label: 'staff', day: { brightness: .25, texture: .25, shape: .22 }, night: { brightness: .70, texture: .40, shape: .24 } },
  { label: 'staff', day: { brightness: .30, texture: .30, shape: .25 }, night: { brightness: .75, texture: .45, shape: .28 } },
  { label: 'staff', day: { brightness: .22, texture: .35, shape: .30 }, night: { brightness: .67, texture: .50, shape: .31 } },
  { label: 'staff', day: { brightness: .28, texture: .28, shape: .26 }, night: { brightness: .73, texture: .43, shape: .27 } },
  { label: 'staff', day: { brightness: .18, texture: .32, shape: .20 }, night: { brightness: .63, texture: .47, shape: .22 } },
  { label: 'visitor', day: { brightness: .75, texture: .65, shape: .72 }, night: { brightness: .60, texture: .60, shape: .70 } },
  { label: 'visitor', day: { brightness: .80, texture: .70, shape: .78 }, night: { brightness: .65, texture: .65, shape: .76 } },
  { label: 'visitor', day: { brightness: .70, texture: .75, shape: .68 }, night: { brightness: .55, texture: .70, shape: .69 } },
  { label: 'visitor', day: { brightness: .78, texture: .60, shape: .75 }, night: { brightness: .63, texture: .55, shape: .73 } },
  { label: 'visitor', day: { brightness: .72, texture: .68, shape: .70 }, night: { brightness: .57, texture: .63, shape: .71 } },
  { label: 'visitor', day: { brightness: .82, texture: .72, shape: .82 }, night: { brightness: .67, texture: .67, shape: .80 } },
]

function classRecall(rows: readonly ShiftSample[], label: ShiftLabel, predict: (sample: ShiftSample) => ShiftLabel) {
  const selected = rows.filter((row) => row.label === label)
  return selected.filter((row) => predict(row) === label).length / selected.length
}

function fittedThreshold(feature: ShiftFeature) {
  const staff = SHIFT_SAMPLES.filter((row) => row.label === 'staff')
  const visitor = SHIFT_SAMPLES.filter((row) => row.label === 'visitor')
  const mean = (rows: readonly ShiftSample[]) => rows.reduce((sum, row) => sum + row.day[feature], 0) / rows.length
  const staffMean = mean(staff)
  const visitorMean = mean(visitor)
  return {
    threshold: (staffMean + visitorMean) / 2,
    visitorHigh: visitorMean > staffMean,
  }
}

export function evaluateShift(feature: ShiftFeature, environment: ShiftEnvironment): ShiftMetrics {
  const { threshold, visitorHigh } = fittedThreshold(feature)
  const predict = (sample: ShiftSample): ShiftLabel => {
    const value = sample[environment][feature]
    const visitor = visitorHigh ? value >= threshold : value <= threshold
    return visitor ? 'visitor' : 'staff'
  }
  const accuracy = SHIFT_SAMPLES.filter((row) => predict(row) === row.label).length / SHIFT_SAMPLES.length
  return {
    feature,
    environment,
    accuracy,
    minRecall: Math.min(
      classRecall(SHIFT_SAMPLES, 'staff', predict),
      classRecall(SHIFT_SAMPLES, 'visitor', predict),
    ),
  }
}

export function levelOnePass(feature: LevelOneFeature) {
  const result = evaluateLevelOne(feature)
  return result.train >= .8 && result.field >= .8
}

export function levelTwoPass(threshold: number) {
  const result = evaluateScreening(threshold)
  return result.accuracy >= .8 && result.urgentRecall >= .75
}

export function levelThreePass(feature: ShiftFeature) {
  const day = evaluateShift(feature, 'day')
  const night = evaluateShift(feature, 'night')
  return day.accuracy >= .8 && day.minRecall >= .75 && night.accuracy >= .8 && night.minRecall >= .75
}

export const LAB_LEVELS = [
  {
    id: 1 as const,
    code: 'LEVEL 01',
    title: '训练集不是世界',
    objective: '让分类器通过未知现场门，而不是只把训练分刷满。',
    primitive: 'TEST PROBE',
    term: '独立测试集 / 泛化',
  },
  {
    id: 2 as const,
    code: 'LEVEL 02',
    title: '平均数会藏人',
    objective: '总体准确率 ≥ 80%，同时优先病例召回 ≥ 75%。',
    primitive: 'CLASS PROBE',
    term: '分类别召回 / 阈值取舍',
  },
  {
    id: 3 as const,
    code: 'LEVEL 03',
    title: '只在白天正确',
    objective: '同一观察通道必须同时通过 DAY 与 NIGHT。',
    primitive: 'ENV SWITCH',
    term: '分布变化 / 稳定特征',
  },
] as const
