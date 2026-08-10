import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY, type ModelId } from '../ml/registry'
import { createRng, jitter } from '../ml/rng'
import type { FeatureKey, PublicSample, RawFeatures, Sample, SampleFlags } from '../ml/types'

export type EndlessSyndrome = 'feature-gap' | 'overfit-noise' | 'distribution-shift' | 'class-imbalance'
export type EndlessCaseLeadId = 'composition' | 'batch' | 'quality'

export type EndlessCaseLead = {
  id: EndlessCaseLeadId
  label: string
  prompt: string
  finding: string
  result: 'signal' | 'clear'
}

export type EndlessAuditResult = {
  accuracy: number
  errorCount: number
  predictions: Array<{ id: string; predicted: 'cat' | 'bread' }>
  mistakes: Array<{ id: string; actual: 'cat' | 'bread'; predicted: 'cat' | 'bread'; features: RawFeatures }>
  recall: { cat: number; bread: number }
}

export type EndlessCase = {
  seed: number
  caseNo: number
  syndrome: EndlessSyndrome
  baseline: { model: ModelId; features: [FeatureKey, FeatureKey] }
  title: string
  incident: string
  reportedFacts: string[]
  leadSources: EndlessCaseLead[]
  archiveAlerts: Array<{ id: string; label: string }>
  batchContext?: { history: string; field: string }
  classNames: { cat: string; bread: string }
  featureNames: Record<FeatureKey, string>
  featureHints: Record<FeatureKey, string>
  train: Sample[]
  publicTest: PublicSample[]
  audit: (model: ModelId, features: [FeatureKey, FeatureKey]) => EndlessAuditResult
  isReliable: (audit: EndlessAuditResult) => boolean
  diagnosis: {
    correct: EndlessSyndrome
    options: Array<{ id: EndlessSyndrome; label: string }>
    explanation: string
  }
}

export type EndlessSolution = {
  model: ModelId
  features: [FeatureKey, FeatureKey]
  trainAccuracy: number
  testAccuracy: number
  errorCount: number
  minRecall: number
  reliable: boolean
}

export type EndlessCasePreview = Pick<EndlessCase, 'seed' | 'caseNo' | 'title' | 'incident' | 'reportedFacts'>

const FEATURE_PAIRS: Array<[FeatureKey, FeatureKey]> = [
  ['warmth', 'roundness'], ['warmth', 'texture'], ['warmth', 'aspect'],
  ['roundness', 'texture'], ['roundness', 'aspect'], ['texture', 'aspect'],
]
const MODELS: ModelId[] = ['linear', 'tree', 'knn-1', 'knn-5']

type InternalConfiguration = {
  model: ModelId
  features: [FeatureKey, FeatureKey]
  trainAccuracy: number
  testAccuracy: number
  minRecall: number
}

function sample(id: string, split: 'train' | 'test', label: 'cat' | 'bread', features: RawFeatures, flags?: SampleFlags): Sample {
  return { id, split, label, features, ...(flags ? { flags } : {}) }
}

const ENDLESS_THEMES: Record<EndlessSyndrome, Array<{
  title: string
  incident: string
  archiveIssue?: string
  batchContext?: { history: string; field: string }
  classNames: { cat: string; bread: string }
  featureNames: Record<FeatureKey, string>
  featureHints: Record<FeatureKey, string>
}>> = {
  'feature-gap': [
    {
      title: 'CASE / 失物招领误分',
      incident: '失物招领柜近期把不少保温瓶归到普通水杯。相似容器之间的误分已经连续出现，值班员要求重新调查这套分类规则。',
      batchContext: { history: '旧柜台 / 冷白灯 / 固定俯拍', field: '新柜台 / 暖白灯 / 固定俯拍' },
      classNames: { cat: '普通水杯', bread: '保温瓶' },
      featureNames: { warmth: '主色亮度', roundness: '杯口圆度', texture: '杯盖纹路', aspect: '瓶身长宽' },
      featureHints: {
        warmth: '不同材质都可能很亮。', roundness: '两类容器的杯口都可能很圆。',
        texture: '杯盖结构留下稳定纹路。', aspect: '瓶身比例能补充外观差异。',
      },
    },
    {
      title: 'CASE / 打印页分拣混乱',
      incident: '打印室最近把课程作业和活动宣传单频繁混在一起。错误并非单次偶发，现有自动分拣已经无法直接信任。',
      classNames: { cat: '课程作业', bread: '宣传单' },
      featureNames: { warmth: '纸面亮度', roundness: '墨块面积', texture: '标题结构', aspect: '版式重复度' },
      featureHints: {
        warmth: '同一种打印机让亮度很接近。', roundness: '两类页面都可能有大块文字。',
        texture: '标题结构在同类文档里更稳定。', aspect: '宣传模板通常重复固定布局。',
      },
    },
    {
      title: 'CASE / 社团邮箱误杀',
      incident: '社团报名邮件近期被大量丢进垃圾箱。多名报名者报告同类误杀，值班员要求确认系统究竟在哪一环失效。',
      classNames: { cat: '正常邮件', bread: '垃圾邮件' },
      featureNames: { warmth: '感叹号密度', roundness: '链接数量', texture: '发件人可信度', aspect: '正文重复度' },
      featureHints: {
        warmth: '两类邮件都可能很激动。', roundness: '正常通知也可能有很多链接。',
        texture: '长期可信的发件人更稳定。', aspect: '批量垃圾内容往往高度重复。',
      },
    },
  ],
  'overfit-noise': [
    {
      title: 'CASE / 温室叶片误报',
      archiveIssue: '旧摄像头采集质量告警 / 镜头污染',
      incident: '温室最近出现大量病害误报：健康叶片频繁触发警报。系统此前被认为可以上线，但当前现场结果已经无法继续信任。',
      classNames: { cat: '健康叶片', bread: '病害叶片' },
      featureNames: { warmth: '叶面亮度', roundness: '轮廓完整度', texture: '叶脉纹理', aspect: '斑点比例' },
      featureHints: {
        warmth: '灯光会让亮度抖动。', roundness: '叶片姿态会影响轮廓。',
        texture: '叶脉与病斑纹理更稳定。', aspect: '斑点占比能补充局部结构。',
      },
    },
    {
      title: 'CASE / 打印机纸张质检',
      archiveIssue: '测量仪校准异常 / 记录可信度低',
      incident: '纸张质检系统近期对卡纸风险判断不稳，值班人员已经记录到多次错误放行。需要重新确认问题来自哪里。',
      batchContext: { history: '白班 / 校准台 A / 常温', field: '晚班 / 校准台 B / 常温' },
      classNames: { cat: '正常纸张', bread: '卡纸风险' },
      featureNames: { warmth: '纸面白度', roundness: '边角圆整度', texture: '纤维纹理', aspect: '边缘形变' },
      featureHints: {
        warmth: '曝光会改变白度。', roundness: '轻微卷边会干扰轮廓。',
        texture: '纤维异常通常更稳定。', aspect: '整体形变比单个亮点可靠。',
      },
    },
    {
      title: 'CASE / 芯片质检异常',
      archiveIssue: '传感器读数异常 / 采集质量待复核',
      incident: '芯片质检系统上线后仍会漏掉缺陷，现场人员已经停止把自动判断当作最终结论。需要重新调查失败原因。',
      classNames: { cat: '正常芯片', bread: '缺陷芯片' },
      featureNames: { warmth: '边缘亮度', roundness: '焊点圆整度', texture: '纹理波动', aspect: '引脚比例' },
      featureHints: {
        warmth: '照明变化会影响亮度。', roundness: '焊点形态有帮助但存在重叠。',
        texture: '缺陷通常带来稳定纹理差异。', aspect: '结构比例通常比单点测量更稳。',
      },
    },
  ],
  'distribution-shift': [
    {
      title: 'CASE / 道路监控误判',
      batchContext: { history: '晴天 / 白天 / 路面干燥', field: '雨天 / 反光增强 / 能见度下降' },
      incident: '道路监控近期频繁把行人与路牌混淆。错误从最近一批现场样本开始集中出现，但当前还没有完成原因复核。',
      classNames: { cat: '行人', bread: '路牌' },
      featureNames: { warmth: '画面亮度', roundness: '目标面积', texture: '边缘纹理', aspect: '目标长宽' },
      featureHints: {
        warmth: '天气最先改变整体亮度。', roundness: '雨天拍摄距离会影响面积。',
        texture: '局部边缘结构相对稳定。', aspect: '目标比例通常比亮度耐环境变化。',
      },
    },
    {
      title: 'CASE / 球类识别异常',
      batchContext: { history: '白天 / 固定远景 / 顶灯关闭', field: '夜场 / 顶灯开启 / 摄像距离变化' },
      incident: '体育馆的球类识别近期错误骤增，篮球与排球之间反复互相误判。值班员要求确认这次异常的真正来源。',
      classNames: { cat: '篮球', bread: '排球' },
      featureNames: { warmth: '颜色暖度', roundness: '表观半径', texture: '表面纹理', aspect: '拼片比例' },
      featureHints: {
        warmth: '场馆灯光会显著改变颜色。', roundness: '远近会改变表观大小。',
        texture: '表面纹路更抗整体照明变化。', aspect: '拼片结构比例相对稳定。',
      },
    },
    {
      title: 'CASE / 闸机识别异常',
      batchContext: { history: '白天 / Camera-A / 稳定自然光', field: '夜间 / Camera-B / 红外补光' },
      incident: '闸机识别近期错误明显增加，授权与异常通行之间出现连续误判。需要先复现故障，再调查哪一环发生变化。',
      classNames: { cat: '授权通行', bread: '异常通行' },
      featureNames: { warmth: '画面亮度', roundness: '轮廓面积', texture: '局部纹理', aspect: '目标比例' },
      featureHints: {
        warmth: '白天与夜间最容易变化。', roundness: '拍摄距离也会改变面积。',
        texture: '局部纹理相对稳定。', aspect: '比例通常不受整体亮度影响。',
      },
    },
  ],
  'class-imbalance': [
    {
      title: 'CASE / 机房告警漏报',
      incident: '机房告警系统近期仍会漏掉真正的故障，值班员已经连续遇到未报警事件。现有总体报告无法解释这些漏报。',
      batchContext: { history: '工作日 / 机房 A / 常规负载', field: '周末 / 机房 B / 低负载' },
      classNames: { cat: '正常日志', bread: '故障日志' },
      featureNames: { warmth: '日志长度', roundness: '突发次数', texture: '错误签名', aspect: '时序比例' },
      featureHints: {
        warmth: '正常和故障日志都可能很长。', roundness: '突发次数本身不一定说明故障。',
        texture: '错误签名能补充稀少故障的结构。', aspect: '时序比例对少数异常更有区分力。',
      },
    },
    {
      title: 'CASE / 裂纹质检漏检',
      incident: '零件质检近期仍有裂纹件被漏检。虽然系统报告没有显示全面崩溃，但这些关键错误已经足以触发复查。',
      classNames: { cat: '正常零件', bread: '裂纹零件' },
      featureNames: { warmth: '表面亮度', roundness: '轮廓圆整度', texture: '裂纹纹理', aspect: '边缘比例' },
      featureHints: {
        warmth: '光照会让两类零件都变亮。', roundness: '完整轮廓并不排除细裂纹。',
        texture: '局部裂纹纹理对少数缺陷很关键。', aspect: '边缘结构能补充微小缺陷。',
      },
    },
    {
      title: 'CASE / 水泵预警漏报',
      incident: '水泵预警系统近期漏掉了多次真实故障周期。维修人员要求重新调查，因为单看现有汇总报告无法解释漏报。',
      classNames: { cat: '正常周期', bread: '故障周期' },
      featureNames: { warmth: '平均温度', roundness: '峰值次数', texture: '振动纹理', aspect: '周期比例' },
      featureHints: {
        warmth: '正常负载也可能升温。', roundness: '偶发峰值在正常周期也存在。',
        texture: '振动结构能描述故障细节。', aspect: '周期比例对少数故障更稳定。',
      },
    },
  ],
}

function themeFor(syndrome: EndlessSyndrome, seed: number) {
  const variants = ENDLESS_THEMES[syndrome]
  return variants[Math.floor(Math.abs(seed) / 3) % variants.length]
}

function diagonalFeatures(rng: ReturnType<typeof createRng>, label: 'cat' | 'bread', index: number, radius = .07): Pick<RawFeatures, 'texture' | 'aspect'> {
  const branch = index % 2
  if (label === 'cat') {
    return branch === 0
      ? { texture: jitter(rng, .76, radius), aspect: jitter(rng, .50, radius) }
      : { texture: jitter(rng, .50, radius), aspect: jitter(rng, .24, radius) }
  }
  return branch === 0
    ? { texture: jitter(rng, .24, radius), aspect: jitter(rng, .50, radius) }
    : { texture: jitter(rng, .50, radius), aspect: jitter(rng, .76, radius) }
}

function weakSensors(rng: ReturnType<typeof createRng>) {
  return { warmth: jitter(rng, .52, .22), roundness: jitter(rng, .50, .22) }
}

function generateFeatureGap(seed: number) {
  const rng = createRng(seed)
  const train: Sample[] = []
  const test: Sample[] = []
  for (let i = 0; i < 18; i += 1) {
    train.push(sample(`train-cat-${i}`, 'train', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i) }))
    train.push(sample(`train-bread-${i}`, 'train', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i) }))
  }
  for (let i = 0; i < 14; i += 1) {
    test.push(sample(`test-cat-${i}`, 'test', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i, .09) }))
    test.push(sample(`test-bread-${i}`, 'test', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i, .09) }))
  }
  return { train, test }
}

function generateOverfit(seed: number) {
  const rng = createRng(seed)
  const train: Sample[] = []
  const test: Sample[] = []
  for (let i = 0; i < 16; i += 1) {
    train.push(sample(`train-cat-${i}`, 'train', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i) }))
    train.push(sample(`train-bread-${i}`, 'train', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i) }))
  }
  // Four mislabeled measurement records sit deep in the opposite region. Each
  // has a small neighborhood of correctly labeled records around it. This makes
  // the causal contrast robust in every 2D projection: 1-NN can latch onto the
  // single bad record, while k=5 sees the local majority and smooths it away.
  const noisyRecords: Array<{ id: string; label: 'cat' | 'bread'; actual: 'cat' | 'bread'; features: RawFeatures }> = [
    { id: 'archive-flag-01', label: 'cat', actual: 'bread', features: { ...weakSensors(rng), texture: .25, aspect: .51 } },
    { id: 'archive-flag-02', label: 'cat', actual: 'bread', features: { ...weakSensors(rng), texture: .50, aspect: .76 } },
    { id: 'archive-flag-03', label: 'bread', actual: 'cat', features: { ...weakSensors(rng), texture: .75, aspect: .49 } },
    { id: 'archive-flag-04', label: 'bread', actual: 'cat', features: { ...weakSensors(rng), texture: .50, aspect: .24 } },
  ]
  const near = (features: RawFeatures, radius: number): RawFeatures => ({
    warmth: jitter(rng, features.warmth, radius),
    roundness: jitter(rng, features.roundness, radius),
    texture: jitter(rng, features.texture, radius),
    aspect: jitter(rng, features.aspect, radius),
  })
  for (const record of noisyRecords) {
    train.push(sample(record.id, 'train', record.label, record.features, { noise: true }))
    for (let anchor = 1; anchor <= 3; anchor += 1) {
      train.push(sample(`${record.id}-anchor-${anchor}`, 'train', record.actual, near(record.features, .035 + anchor * .006)))
    }
  }
  for (let i = 0; i < 12; i += 1) {
    test.push(sample(`test-cat-${i}`, 'test', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i, .085) }))
    test.push(sample(`test-bread-${i}`, 'test', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i, .085) }))
  }
  // Two field probes sit very close to each noisy record in all four dimensions.
  // They are not duplicates: small jitter keeps them as unseen observations, but
  // the mislabeled archive record remains the nearest local memory for 1-NN.
  for (const [index, record] of noisyRecords.entries()) {
    test.push(
      sample(`test-${record.actual}-probe-${index * 2 + 1}`, 'test', record.actual, near(record.features, .008)),
      sample(`test-${record.actual}-probe-${index * 2 + 2}`, 'test', record.actual, near(record.features, .012)),
    )
  }
  return { train, test }
}

function generateShift(seed: number) {
  const rng = createRng(seed)
  const train: Sample[] = []
  const test: Sample[] = []
  for (let i = 0; i < 18; i += 1) {
    const stableCat = diagonalFeatures(rng, 'cat', i)
    const stableBread = diagonalFeatures(rng, 'bread', i)
    train.push(sample(`train-cat-${i}`, 'train', 'cat', {
      warmth: jitter(rng, .82, .07), roundness: jitter(rng, .76, .08), ...stableCat,
    }))
    train.push(sample(`train-bread-${i}`, 'train', 'bread', {
      warmth: jitter(rng, .20, .07), roundness: jitter(rng, .28, .08), ...stableBread,
    }))
  }
  for (let i = 0; i < 14; i += 1) {
    // The new field environment compresses the two historical shortcut sensors
    // toward each other. Their old relationship becomes much less reliable, but
    // does not deterministically reverse. This makes a first field failure
    // compatible with several causal stories; stable texture/aspect keeps the
    // same relationship so a controlled field-only intervention can still
    // distinguish the shift explanation later.
    test.push(sample(`test-cat-${i}`, 'test', 'cat', {
      warmth: jitter(rng, .55, .14), roundness: jitter(rng, .54, .15), ...diagonalFeatures(rng, 'cat', i, .09),
    }))
    test.push(sample(`test-bread-${i}`, 'test', 'bread', {
      warmth: jitter(rng, .45, .14), roundness: jitter(rng, .46, .15), ...diagonalFeatures(rng, 'bread', i, .09),
    }))
  }
  return { train, test }
}

function generateImbalance(seed: number) {
  const rng = createRng(seed)
  const train: Sample[] = []
  const test: Sample[] = []
  // The archive is intentionally dominated by class A. A majority-biased local
  // rule can look excellent on overall accuracy while missing rare class B.
  for (let i = 0; i < 40; i += 1) {
    train.push(sample(`train-cat-${i}`, 'train', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i, .075) }))
  }
  for (let i = 0; i < 4; i += 1) {
    train.push(sample(`train-bread-${i}`, 'train', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i, .065) }))
  }
  for (let i = 0; i < 36; i += 1) {
    test.push(sample(`test-cat-${i}`, 'test', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i, .085) }))
  }
  for (let i = 0; i < 6; i += 1) {
    test.push(sample(`test-bread-${i}`, 'test', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i, .085) }))
  }
  return { train, test }
}

function permuteCaseChannels(seed: number, data: { train: Sample[]; test: Sample[] }, theme: ReturnType<typeof themeFor>) {
  const sourceKeys: FeatureKey[] = ['warmth', 'roundness', 'texture', 'aspect']
  const targets = [...sourceKeys]
  const rng = createRng(seed ^ 0x51f15e)
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[targets[index], targets[swap]] = [targets[swap], targets[index]]
  }
  const targetFor = Object.fromEntries(sourceKeys.map((source, index) => [source, targets[index]])) as Record<FeatureKey, FeatureKey>
  const remapFeatures = (features: RawFeatures) => {
    const next = {} as RawFeatures
    for (const source of sourceKeys) next[targetFor[source]] = features[source]
    return next
  }
  const remapSample = (item: Sample): Sample => ({ ...item, features: remapFeatures(item.features) })
  const featureNames = {} as Record<FeatureKey, string>
  const featureHints = {} as Record<FeatureKey, string>
  for (const source of sourceKeys) {
    featureNames[targetFor[source]] = theme.featureNames[source]
    featureHints[targetFor[source]] = theme.featureHints[source]
  }
  return {
    train: data.train.map(remapSample),
    test: data.test.map(remapSample),
    featureNames,
    featureHints,
  }
}

function internalConfiguration(
  data: { train: Sample[]; test: Sample[] },
  model: ModelId,
  features: [FeatureKey, FeatureKey],
): InternalConfiguration {
  const trainPoints = projectSamples(data.train, features)
  const testPoints = projectSamples(data.test, features)
  const fitted = MODEL_REGISTRY[model].fit(trainPoints)
  const train = evaluate(fitted, trainPoints)
  const field = evaluate(fitted, testPoints)
  const catTotal = field.confusion['cat->cat'] + field.confusion['cat->bread']
  const breadTotal = field.confusion['bread->cat'] + field.confusion['bread->bread']
  return {
    model,
    features,
    trainAccuracy: train.accuracy,
    testAccuracy: field.accuracy,
    minRecall: Math.min(
      catTotal ? field.confusion['cat->cat'] / catTotal : 0,
      breadTotal ? field.confusion['bread->bread'] / breadTotal : 0,
    ),
  }
}

function sameFeatureSet(a: [FeatureKey, FeatureKey], b: [FeatureKey, FeatureKey]) {
  return a.every((feature) => b.includes(feature)) && b.every((feature) => a.includes(feature))
}

function interventionGain(from: InternalConfiguration, to: InternalConfiguration) {
  return Math.max(to.testAccuracy - from.testAccuracy, to.minRecall - from.minRecall)
}

function selectDeployedBaseline(
  syndrome: EndlessSyndrome,
  data: { train: Sample[]; test: Sample[] },
) {
  const configurations = FEATURE_PAIRS.flatMap((features) => MODELS.map((model) => internalConfiguration(data, model, features)))
  const bestFieldGain = (configuration: InternalConfiguration) => Math.max(
    ...configurations
      .filter((candidate) => candidate.model === configuration.model && !sameFeatureSet(candidate.features, configuration.features))
      .map((candidate) => interventionGain(configuration, candidate)),
    -1,
  )
  const bestModelGain = (configuration: InternalConfiguration) => Math.max(
    ...configurations
      .filter((candidate) => candidate.model !== configuration.model && sameFeatureSet(candidate.features, configuration.features))
      .map((candidate) => interventionGain(configuration, candidate)),
    -1,
  )
  const gainToModel = (configuration: InternalConfiguration, model: ModelId) => {
    const candidate = configurations.find((item) => item.model === model && sameFeatureSet(item.features, configuration.features))
    return candidate ? interventionGain(configuration, candidate) : -1
  }

  let candidates: InternalConfiguration[]
  if (syndrome === 'feature-gap') {
    candidates = configurations.filter((configuration) =>
      configuration.model === 'linear'
      && configuration.testAccuracy < .8
      && configuration.trainAccuracy < .94
      && bestFieldGain(configuration) >= .15
      && bestFieldGain(configuration) - bestModelGain(configuration) >= .12,
    )
  } else if (syndrome === 'overfit-noise') {
    candidates = configurations.filter((configuration) =>
      configuration.model === 'knn-1'
      && configuration.trainAccuracy >= .98
      && configuration.testAccuracy < .9
      && (configuration.testAccuracy < .85 || configuration.minRecall < .75)
      && gainToModel(configuration, 'knn-5') >= .12,
    )
  } else if (syndrome === 'distribution-shift') {
    candidates = configurations.filter((configuration) =>
      configuration.model === 'linear'
      && configuration.trainAccuracy >= .95
      && configuration.testAccuracy < .8
      && bestFieldGain(configuration) >= .2
      && bestFieldGain(configuration) - bestModelGain(configuration) >= .2,
    )
  } else {
    candidates = configurations.filter((configuration) =>
      configuration.testAccuracy >= .83
      && configuration.minRecall < .75
      && bestFieldGain(configuration) >= .15
      && bestFieldGain(configuration) - bestModelGain(configuration) >= .08,
    )
  }

  const targetField = syndrome === 'feature-gap' ? .68
    : syndrome === 'overfit-noise' ? .76
      : syndrome === 'distribution-shift' ? .62
        : .9
  candidates.sort((a, b) =>
    Math.abs(a.testAccuracy - targetField) - Math.abs(b.testAccuracy - targetField)
    || b.trainAccuracy - a.trainAccuracy,
  )

  if (!candidates.length) {
    const fallback = configurations
      .filter((configuration) => syndrome === 'overfit-noise'
        ? configuration.model === 'knn-1'
          && configuration.trainAccuracy >= .98
          && configuration.testAccuracy < .9
          && (configuration.testAccuracy < .85 || configuration.minRecall < .75)
        : syndrome === 'class-imbalance'
          ? configuration.testAccuracy >= .83 && configuration.minRecall < .75
          : syndrome === 'distribution-shift'
            ? (configuration.testAccuracy < .85 || configuration.minRecall < .75)
              && bestFieldGain(configuration) >= .12
          : configuration.testAccuracy < .8)
      .sort((a, b) => {
        const aGain = syndrome === 'overfit-noise' ? bestModelGain(a) : bestFieldGain(a)
        const bGain = syndrome === 'overfit-noise' ? bestModelGain(b) : bestFieldGain(b)
        return bGain - aGain
      })[0]
    if (fallback) return { model: fallback.model, features: [...fallback.features] as [FeatureKey, FeatureKey] }
  }

  const selected = candidates[0] ?? configurations[0]
  return { model: selected.model, features: [...selected.features] as [FeatureKey, FeatureKey] }
}

export function createEndlessCase(seed: number): EndlessCase {
  const syndrome: EndlessSyndrome = (['feature-gap', 'overfit-noise', 'distribution-shift', 'class-imbalance'] as const)[Math.abs(seed) % 4]
  const theme = themeFor(syndrome, seed)
  const baseData = syndrome === 'feature-gap'
    ? generateFeatureGap(seed)
    : syndrome === 'overfit-noise'
      ? generateOverfit(seed)
      : syndrome === 'distribution-shift'
        ? generateShift(seed)
        : generateImbalance(seed)
  const data = permuteCaseChannels(seed, baseData, theme)
  const baseline = selectDeployedBaseline(syndrome, data)
  const publicIdByInternal = new Map(data.test.map((sample, index) => [sample.id, `field-${String(index + 1).padStart(3, '0')}`]))
  const publicId = (internalId: string) => {
    const id = publicIdByInternal.get(internalId)
    if (!id) throw new Error(`Missing endless public id for ${internalId}`)
    return id
  }
  const publicTest = data.test.map(({ label: _label, flags: _flags, ...rest }) => ({ ...rest, id: publicId(rest.id) }))
  const trainCatCount = data.train.filter((item) => item.label === 'cat').length
  const trainBreadCount = data.train.filter((item) => item.label === 'bread').length
  const archiveAlerts = data.train
    .filter((item) => item.flags?.noise)
    .map((item) => ({ id: item.id, label: theme.archiveIssue ?? '历史采集质量告警' }))
  // Opening reports intentionally describe symptoms, not causes. Precise archive
  // composition, batch metadata and quality flags are all real evidence, but the
  // player has to choose to inspect those sources after reproducing the failure.
  // Some non-shift cases deliberately contain a real operational batch change as
  // a background confound. A positive H-CONTEXT finding therefore says only that
  // the change deserves testing; it no longer uniquely identifies distribution shift.
  const reportedFacts = [
    `${theme.classNames.cat} / ${theme.classNames.bread} 的错误已经在最近现场重复出现，值班报告确认并非单个偶发样本。`,
    '历史档案构成、采集批次与质量记录都可复核；在完成第一条现场基线前，调查局不会替你判断哪一条最可疑。',
  ]
  const leadSources: EndlessCaseLead[] = [
    {
      id: 'composition',
      label: '历史档案构成',
      prompt: '核对两类历史样本各有多少，检查“总体数字”是否可能掩盖覆盖问题。',
      finding: `历史档案：${theme.classNames.cat} ${trainCatCount} 条；${theme.classNames.bread} ${trainBreadCount} 条。`,
      result: Math.max(trainCatCount, trainBreadCount) / Math.max(1, Math.min(trainCatCount, trainBreadCount)) >= 3 ? 'signal' : 'clear',
    },
    {
      id: 'batch',
      label: '采集批次记录',
      prompt: '对照历史与当前现场的采集条件，确认环境或设备变化是否值得继续追查。',
      finding: theme.batchContext
        ? `HISTORY：${theme.batchContext.history}；FIELD：${theme.batchContext.field}。`
        : '批次编号发生更新，但记录中没有设备、环境或采集规范的实质切换。',
      result: theme.batchContext ? 'signal' : 'clear',
    },
    {
      id: 'quality',
      label: '历史质量记录',
      prompt: '检查历史档案是否存在被采集系统主动标出的可疑记录。',
      finding: archiveAlerts.length
        ? `质量系统标出了 ${archiveAlerts.length} 条需要人工复核的历史记录。打开后可查看具体记录。`
        : '质量系统没有标出需要人工复核的历史记录；目前没有直接的采集异常证据。',
      result: archiveAlerts.length ? 'signal' : 'clear',
    },
  ]

  const explanations: Record<EndlessSyndrome, string> = {
    'feature-gap': '当前观察字段没有承载稳定类别信息。换模型只能在贫弱信息上继续加工，优先换特征。',
    'overfit-noise': '训练记录里有少量噪声。过度贴合单点会把偶然错误一起记住，应比较训练与未知表现。',
    'distribution-shift': '上线环境改变了部分输入分布。训练时很强的线索到了现场失效，应寻找跨环境更稳定的特征。',
    'class-imbalance': '历史数据被多数类淹没。总体准确率可能很好看，但少数类召回很差；可靠方案必须同时照顾两类。',
  }
  const diagnosisOptions: Array<{ id: EndlessSyndrome; label: string }> = [
    { id: 'feature-gap', label: '观察特征没有抓住真正差异' },
    { id: 'overfit-noise', label: '模型把训练噪声和偶然点记得太死' },
    { id: 'distribution-shift', label: '训练环境与现场环境发生了分布变化' },
    { id: 'class-imbalance', label: '多数类把总体准确率撑高，少数类却一直漏掉' },
  ]
  const diagnosisRng = createRng(seed ^ 0x7a11ce)
  for (let index = diagnosisOptions.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(diagnosisRng() * (index + 1))
    ;[diagnosisOptions[index], diagnosisOptions[swap]] = [diagnosisOptions[swap], diagnosisOptions[index]]
  }
  return {
    seed,
    caseNo: Math.abs(seed) % 10000,
    syndrome,
    baseline,
    title: theme.title,
    incident: theme.incident,
    reportedFacts,
    leadSources,
    archiveAlerts,
    batchContext: theme.batchContext,
    classNames: theme.classNames,
    featureNames: data.featureNames,
    featureHints: data.featureHints,
    train: data.train,
    publicTest,
    audit: (modelId, features) => {
      const trainPoints = projectSamples(data.train, features)
      const testPoints = projectSamples(data.test, features)
      const model = MODEL_REGISTRY[modelId].fit(trainPoints)
      const result = evaluate(model, testPoints)
      const catTotal = result.confusion['cat->cat'] + result.confusion['cat->bread']
      const breadTotal = result.confusion['bread->cat'] + result.confusion['bread->bread']
      return {
        accuracy: result.accuracy,
        errorCount: result.errorCount,
        predictions: result.predictions.map(({ id, predicted }) => ({ id: publicId(id), predicted })),
        mistakes: result.mistakes.map(({ id, actual, predicted }) => ({
          id: publicId(id),
          actual,
          predicted,
          features: data.test.find((sample) => sample.id === id)!.features,
        })),
        recall: {
          cat: catTotal ? result.confusion['cat->cat'] / catTotal : 0,
          bread: breadTotal ? result.confusion['bread->bread'] / breadTotal : 0,
        },
      }
    },
    isReliable: (audit) => audit.accuracy >= .85 && Math.min(audit.recall.cat, audit.recall.bread) >= .75,
    diagnosis: {
      correct: syndrome,
      options: diagnosisOptions,
      explanation: explanations[syndrome],
    },
  }
}

export function createEndlessCasePreview(seed: number): EndlessCasePreview {
  const { caseNo, title, incident, reportedFacts } = createEndlessCase(seed)
  return { seed, caseNo, title, incident, reportedFacts }
}

export function enumerateEndlessSolutions(caseData: EndlessCase): EndlessSolution[] {
  const solutions: EndlessSolution[] = []
  for (const features of FEATURE_PAIRS) {
    const trainPoints = projectSamples(caseData.train, features)
    for (const modelId of MODELS) {
      const model = MODEL_REGISTRY[modelId].fit(trainPoints)
      const trainEval = evaluate(model, trainPoints)
      const audit = caseData.audit(modelId, features)
      solutions.push({
        model: modelId,
        features,
        trainAccuracy: trainEval.accuracy,
        testAccuracy: audit.accuracy,
        errorCount: audit.errorCount,
        minRecall: Math.min(audit.recall.cat, audit.recall.bread),
        reliable: caseData.isReliable(audit),
      })
    }
  }
  return solutions.sort((a, b) => Number(b.reliable) - Number(a.reliable) || b.testAccuracy - a.testAccuracy || b.minRecall - a.minRecall || a.errorCount - b.errorCount)
}

export const ENDLESS_FEATURE_PAIRS = FEATURE_PAIRS
export const ENDLESS_MODELS = MODELS
