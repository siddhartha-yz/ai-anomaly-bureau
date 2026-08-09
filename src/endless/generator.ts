import { evaluate } from '../ml/evaluate'
import { projectSamples } from '../ml/features'
import { MODEL_REGISTRY, type ModelId } from '../ml/registry'
import { createRng, jitter } from '../ml/rng'
import type { FeatureKey, PublicSample, RawFeatures, Sample, SampleFlags } from '../ml/types'

export type EndlessSyndrome = 'feature-gap' | 'overfit-noise' | 'distribution-shift' | 'class-imbalance'

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
  title: string
  incident: string
  reportedFacts: string[]
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

const FEATURE_PAIRS: Array<[FeatureKey, FeatureKey]> = [
  ['warmth', 'roundness'], ['warmth', 'texture'], ['warmth', 'aspect'],
  ['roundness', 'texture'], ['roundness', 'aspect'], ['texture', 'aspect'],
]
const MODELS: ModelId[] = ['linear', 'tree', 'knn-1', 'knn-5']

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
      incident: '失物招领柜近期把不少保温瓶归到普通水杯。历史抽查没有大规模告警，但现场投诉集中在外观相似的容器。',
      classNames: { cat: '普通水杯', bread: '保温瓶' },
      featureNames: { warmth: '主色亮度', roundness: '杯口圆度', texture: '杯盖纹路', aspect: '瓶身长宽' },
      featureHints: {
        warmth: '不同材质都可能很亮。', roundness: '两类容器的杯口都可能很圆。',
        texture: '杯盖结构留下稳定纹路。', aspect: '瓶身比例能补充外观差异。',
      },
    },
    {
      title: 'CASE / 打印页分拣混乱',
      incident: '打印室最近把课程作业和活动宣传单频繁混在一起。历史档案里两类页面都不少，问题究竟出在哪一环还不清楚。',
      classNames: { cat: '课程作业', bread: '宣传单' },
      featureNames: { warmth: '纸面亮度', roundness: '墨块面积', texture: '标题结构', aspect: '版式重复度' },
      featureHints: {
        warmth: '同一种打印机让亮度很接近。', roundness: '两类页面都可能有大块文字。',
        texture: '标题结构在同类文档里更稳定。', aspect: '宣传模板通常重复固定布局。',
      },
    },
    {
      title: 'CASE / 社团邮箱误杀',
      incident: '社团报名邮件近期被大量丢进垃圾箱。旧版本的历史抽查没有大规模告警，但新一批报名邮件误杀明显增加。',
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
      incident: '温室最近出现大量病害误报：健康叶片频繁触发警报。历史记录上的分数一直很高，但新一批叶片表现明显不稳。',
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
      incident: '纸张质检模型在历史档案上接近满分，但现场卡纸风险仍判断不稳。旧档案里留下了几条仪器校准异常记录。',
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
      incident: '芯片质检模型在历史样品上几乎满分，上线后仍会漏掉缺陷。档案系统标出了少量传感器读数异常。',
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
      title: 'CASE / 雨天道路监控',
      batchContext: { history: '晴天 / 白天 / 路面干燥', field: '雨天 / 反光增强 / 能见度下降' },
      incident: '模型在晴天道路的历史验证很好，雨天上线后却频繁把行人与路牌混淆。现场采集条件与历史档案明显不同。',
      classNames: { cat: '行人', bread: '路牌' },
      featureNames: { warmth: '画面亮度', roundness: '目标面积', texture: '边缘纹理', aspect: '目标长宽' },
      featureHints: {
        warmth: '天气最先改变整体亮度。', roundness: '雨天拍摄距离会影响面积。',
        texture: '局部边缘结构相对稳定。', aspect: '目标比例通常比亮度耐环境变化。',
      },
    },
    {
      title: 'CASE / 体育馆夜场误判',
      batchContext: { history: '白天 / 固定远景 / 顶灯关闭', field: '夜场 / 顶灯开启 / 摄像距离变化' },
      incident: '白天采集的球类模型搬到夜场后错误骤增。夜场的灯光和摄像距离与历史采集条件都发生了变化。',
      classNames: { cat: '篮球', bread: '排球' },
      featureNames: { warmth: '颜色暖度', roundness: '表观半径', texture: '表面纹理', aspect: '拼片比例' },
      featureHints: {
        warmth: '场馆灯光会显著改变颜色。', roundness: '远近会改变表观大小。',
        texture: '表面纹路更抗整体照明变化。', aspect: '拼片结构比例相对稳定。',
      },
    },
    {
      title: 'CASE / 夜间闸机异常',
      batchContext: { history: '白天 / Camera-A / 稳定自然光', field: '夜间 / Camera-B / 红外补光' },
      incident: '闸机模型白天验证一直稳定，但夜间摄像头上线后错误暴增。现场时段和光照条件与历史档案不同。',
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
      incident: '机房告警系统总体准确率看起来不低，但值班员仍反复报告真正的故障没有报警。历史档案中正常日志占绝大多数。',
      classNames: { cat: '正常日志', bread: '故障日志' },
      featureNames: { warmth: '日志长度', roundness: '突发次数', texture: '错误签名', aspect: '时序比例' },
      featureHints: {
        warmth: '正常和故障日志都可能很长。', roundness: '突发次数本身不一定说明故障。',
        texture: '错误签名能补充稀少故障的结构。', aspect: '时序比例对少数异常更有区分力。',
      },
    },
    {
      title: 'CASE / 裂纹质检漏检',
      incident: '零件质检的总体准确率一直很好看，但现场仍有裂纹件被漏检。历史档案里正常零件远多于裂纹零件。',
      classNames: { cat: '正常零件', bread: '裂纹零件' },
      featureNames: { warmth: '表面亮度', roundness: '轮廓圆整度', texture: '裂纹纹理', aspect: '边缘比例' },
      featureHints: {
        warmth: '光照会让两类零件都变亮。', roundness: '完整轮廓并不排除细裂纹。',
        texture: '局部裂纹纹理对少数缺陷很关键。', aspect: '边缘结构能补充微小缺陷。',
      },
    },
    {
      title: 'CASE / 水泵预警漏报',
      incident: '水泵预警系统总体分很高，维修人员却发现真正的故障周期经常没有报警。日常运行记录占历史档案的大多数。',
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
  // Four mislabeled measurement records sit deep in the opposite region. A local
  // memorizer can score them perfectly; smoother rules should treat them as noise.
  train.push(
    sample('archive-flag-01', 'train', 'cat', { ...weakSensors(rng), texture: .25, aspect: .51 }, { noise: true }),
    sample('archive-flag-02', 'train', 'cat', { ...weakSensors(rng), texture: .50, aspect: .76 }, { noise: true }),
    sample('archive-flag-03', 'train', 'bread', { ...weakSensors(rng), texture: .75, aspect: .49 }, { noise: true }),
    sample('archive-flag-04', 'train', 'bread', { ...weakSensors(rng), texture: .50, aspect: .24 }, { noise: true }),
  )
  for (let i = 0; i < 12; i += 1) {
    test.push(sample(`test-cat-${i}`, 'test', 'cat', { ...weakSensors(rng), ...diagonalFeatures(rng, 'cat', i, .085) }))
    test.push(sample(`test-bread-${i}`, 'test', 'bread', { ...weakSensors(rng), ...diagonalFeatures(rng, 'bread', i, .085) }))
  }
  // Probes near the noisy records expose 1-NN's local memorization.
  test.push(
    sample('test-bread-probe-1', 'test', 'bread', { ...weakSensors(rng), texture: .26, aspect: .50 }),
    sample('test-bread-probe-2', 'test', 'bread', { ...weakSensors(rng), texture: .50, aspect: .75 }),
    sample('test-cat-probe-1', 'test', 'cat', { ...weakSensors(rng), texture: .74, aspect: .50 }),
    sample('test-cat-probe-2', 'test', 'cat', { ...weakSensors(rng), texture: .50, aspect: .25 }),
  )
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
    // Night deployment reverses the two shortcut sensors. Stable texture/aspect
    // keeps the same relationship, so evidence-led feature choice can recover.
    test.push(sample(`test-cat-${i}`, 'test', 'cat', {
      warmth: jitter(rng, .36, .12), roundness: jitter(rng, .42, .14), ...diagonalFeatures(rng, 'cat', i, .09),
    }))
    test.push(sample(`test-bread-${i}`, 'test', 'bread', {
      warmth: jitter(rng, .64, .12), roundness: jitter(rng, .60, .14), ...diagonalFeatures(rng, 'bread', i, .09),
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
  const reportedFacts: Record<EndlessSyndrome, string[]> = {
    'feature-gap': [
      `历史档案包含 ${trainCatCount} 条${theme.classNames.cat}与 ${trainBreadCount} 条${theme.classNames.bread}，类别数量没有明显失衡。`,
      '现场投诉集中在两类互相混淆；目前还不能判断是观察字段还是模型规则的问题。',
    ],
    'overfit-noise': [
      '历史训练记录的分数一直很漂亮，但换到新一批现场数据后表现不稳定。',
      archiveAlerts.length ? `档案系统标出了 ${archiveAlerts.length} 条采集质量异常记录，可在案件线索中查看。` : '旧档案中存在少量需要复核的采集记录。',
    ],
    'distribution-shift': [
      '这批异常从新的现场采集批次开始；批次元数据包含不同的时段、天气或设备版本。',
      '现场错误没有只集中在某一个类别；究竟哪些观察字段受到了影响仍未确认。',
    ],
    'class-imbalance': [
      `历史档案构成明显不对称：${theme.classNames.cat} ${trainCatCount} 条，${theme.classNames.bread} ${trainBreadCount} 条。`,
      '总体分数看起来不差，但现场报告指出其中一类仍在持续漏报。',
    ],
  }

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
    title: theme.title,
    incident: theme.incident,
    reportedFacts: reportedFacts[syndrome],
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
