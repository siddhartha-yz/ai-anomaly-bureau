import {
  evaluateLevelOne,
  evaluateScreening,
  evaluateShift,
  levelOnePass,
  levelThreePass,
  levelTwoPass,
  type LabLevel,
  type LabTool,
  type LevelOneFeature,
  type ShiftEnvironment,
  type ShiftFeature,
} from './v2Engine'

export const LAB_V2_SESSION_KEY = 'aia.lab-v2.v1'

export type LabRunResult = {
  level: LabLevel
  passed: boolean
  headline: string
  detail: string
  values: readonly { label: string; value: string; pass?: boolean }[]
}

export type LabV2Session = {
  version: 1
  level: LabLevel
  unlockedLevel: LabLevel
  completedLevels: LabLevel[]
  unlockedTools: LabTool[]
  installedTools: LabTool[]
  levelOneFeature: LevelOneFeature
  threshold: number
  shiftFeature: ShiftFeature
  environment: ShiftEnvironment
  shiftPasses: Partial<Record<ShiftEnvironment, ShiftFeature>>
  runCount: number
  lastRun?: LabRunResult
}

export type LabAction =
  | { type: 'go-level'; level: LabLevel }
  | { type: 'install-tool'; tool: LabTool }
  | { type: 'set-level-one-feature'; feature: LevelOneFeature }
  | { type: 'set-threshold'; threshold: number }
  | { type: 'set-shift-feature'; feature: ShiftFeature }
  | { type: 'set-environment'; environment: ShiftEnvironment }
  | { type: 'run' }
  | { type: 'reset' }

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

export function createLabV2Session(): LabV2Session {
  return {
    version: 1,
    level: 1,
    unlockedLevel: 1,
    completedLevels: [],
    unlockedTools: [],
    installedTools: [],
    levelOneFeature: 'appearance',
    threshold: .8,
    shiftFeature: 'brightness',
    environment: 'day',
    shiftPasses: {},
    runCount: 0,
  }
}

function addUnique<T>(items: readonly T[], item: T) {
  return items.includes(item) ? [...items] : [...items, item]
}

function completeLevel(session: LabV2Session, level: LabLevel): LabV2Session {
  const unlockedLevel = Math.max(session.unlockedLevel, Math.min(3, level + 1)) as LabLevel
  return {
    ...session,
    completedLevels: addUnique(session.completedLevels, level),
    unlockedLevel,
  }
}

function runLevelOne(session: LabV2Session): LabV2Session {
  const metrics = evaluateLevelOne(session.levelOneFeature)
  const probeInstalled = session.installedTools.includes('test-probe')
  const passed = probeInstalled && levelOnePass(session.levelOneFeature)
  let next: LabV2Session = {
    ...session,
    unlockedTools: addUnique(session.unlockedTools, 'test-probe'),
    runCount: session.runCount + 1,
    lastRun: {
      level: 1,
      passed,
      headline: !probeInstalled
        ? metrics.field >= .8 ? 'FIELD GATE 暂时通过，但无法预检' : 'FIELD GATE 拒绝部署'
        : passed ? '未知现场通过' : '训练漂亮，现场仍失败',
      detail: !probeInstalled
        ? metrics.field >= .8
          ? `这次未知批次碰巧得到 ${pct(metrics.field)}，但出货前仍没有独立未知探针。TEST PROBE 已释放到工具架。`
          : `训练端显示 ${pct(metrics.train)}，但部署门在未知批次只得到 ${pct(metrics.field)}。TEST PROBE 已释放到工具架。`
        : passed
          ? '你在出货前把未知批次接进了工作台，并换掉了只在训练样本上好看的观察信号。'
          : 'TEST PROBE 已经把问题暴露出来：继续改工作台，直到未知现场也过线。',
      values: [
        { label: 'TRAIN', value: pct(metrics.train), pass: metrics.train >= .8 },
        { label: probeInstalled ? 'TEST' : 'FIELD GATE', value: pct(metrics.field), pass: metrics.field >= .8 },
      ],
    },
  }
  if (passed) next = completeLevel(next, 1)
  return next
}

function runLevelTwo(session: LabV2Session): LabV2Session {
  const metrics = evaluateScreening(session.threshold)
  const classProbeInstalled = session.installedTools.includes('class-probe')
  const passed = classProbeInstalled && levelTwoPass(session.threshold)
  let next: LabV2Session = {
    ...session,
    unlockedTools: addUnique(session.unlockedTools, 'class-probe'),
    runCount: session.runCount + 1,
    lastRun: {
      level: 2,
      passed,
      headline: !classProbeInstalled
        ? '总体分数绿灯，但事故样本仍在闪红'
        : passed ? '双重约束通过' : '至少一个风险约束仍失败',
      detail: !classProbeInstalled
        ? `总体准确率是 ${pct(metrics.accuracy)}，但事故复核标记仍在闪红。CLASS PROBE 已释放到工具架。`
        : passed
          ? '你没有追求单一最高分，而是用同一个阈值同时满足总体质量和少数类安全线。'
          : `当前阈值漏掉 ${metrics.missedUrgent}/4 个优先病例，并产生 ${metrics.falsePositives} 个普通病例误报。`,
      values: [
        { label: 'ACCURACY', value: pct(metrics.accuracy), pass: metrics.accuracy >= .8 },
        ...(classProbeInstalled ? [{ label: 'PRIORITY RECALL', value: pct(metrics.urgentRecall), pass: metrics.urgentRecall >= .75 }] : []),
      ],
    },
  }
  if (passed) next = completeLevel(next, 2)
  return next
}

function runLevelThree(session: LabV2Session): LabV2Session {
  const envSwitchInstalled = session.installedTools.includes('environment-switch')
  const visibleEnvironment = envSwitchInstalled ? session.environment : 'day'
  const visible = evaluateShift(session.shiftFeature, visibleEnvironment)
  const hiddenNight = evaluateShift(session.shiftFeature, 'night')
  const visiblePass = visible.accuracy >= .8 && visible.minRecall >= .75
  const nextPasses = envSwitchInstalled && visiblePass
    ? { ...session.shiftPasses, [visibleEnvironment]: session.shiftFeature }
    : session.shiftPasses
  const sameFeaturePassedBoth = nextPasses.day !== undefined && nextPasses.day === nextPasses.night
  const passed = envSwitchInstalled && sameFeaturePassedBoth && levelThreePass(nextPasses.day!)

  let next: LabV2Session = {
    ...session,
    unlockedTools: addUnique(session.unlockedTools, 'environment-switch'),
    shiftPasses: nextPasses,
    runCount: session.runCount + 1,
    lastRun: {
      level: 3,
      passed,
      headline: !envSwitchInstalled
        ? hiddenNight.accuracy >= .8 ? '夜班碰巧过线，但环境仍不可控' : '白天绿灯，夜班部署失败'
        : passed ? '同一观察通道跨环境通过' : `${visibleEnvironment.toUpperCase()} 测试已记录`,
      detail: !envSwitchInstalled
        ? hiddenNight.accuracy >= .8
          ? `隐藏 NIGHT gate 这次得到 ${pct(hiddenNight.accuracy)}，但你还不能主动切换环境做对照。ENV SWITCH 已释放到工具架。`
          : `DAY 是 ${pct(visible.accuracy)}，隐藏 NIGHT gate 只有 ${pct(hiddenNight.accuracy)}。ENV SWITCH 已释放到工具架。`
        : passed
          ? 'DAY 与 NIGHT 使用同一观察通道，且两边的总体准确率和最低类别召回都通过。'
          : visiblePass
            ? `这次 ${visibleEnvironment.toUpperCase()} 已通过。现在保持同一观察通道，去测另一个环境。`
            : `当前观察通道在 ${visibleEnvironment.toUpperCase()} 不稳定。换信号或切环境继续测。`,
      values: [
        { label: `${visibleEnvironment.toUpperCase()} ACC`, value: pct(visible.accuracy), pass: visible.accuracy >= .8 },
        { label: `${visibleEnvironment.toUpperCase()} MIN RECALL`, value: pct(visible.minRecall), pass: visible.minRecall >= .75 },
        ...(!envSwitchInstalled ? [{ label: 'HIDDEN NIGHT', value: pct(hiddenNight.accuracy), pass: hiddenNight.accuracy >= .8 }] : []),
      ],
    },
  }
  if (passed) next = completeLevel(next, 3)
  return next
}

export function labV2Reducer(session: LabV2Session, action: LabAction): LabV2Session {
  if (action.type === 'reset') return createLabV2Session()
  if (action.type === 'go-level') {
    return action.level <= session.unlockedLevel ? { ...session, level: action.level, lastRun: undefined } : session
  }
  if (action.type === 'install-tool') {
    if (!session.unlockedTools.includes(action.tool)) return session
    return { ...session, installedTools: addUnique(session.installedTools, action.tool), lastRun: undefined }
  }
  if (action.type === 'set-level-one-feature') return { ...session, levelOneFeature: action.feature, lastRun: undefined }
  if (action.type === 'set-threshold') return { ...session, threshold: Math.min(.95, Math.max(.2, action.threshold)), lastRun: undefined }
  if (action.type === 'set-shift-feature') return { ...session, shiftFeature: action.feature, lastRun: undefined }
  if (action.type === 'set-environment') return { ...session, environment: action.environment, lastRun: undefined }
  if (action.type === 'run') {
    if (session.level === 1) return runLevelOne(session)
    if (session.level === 2) return runLevelTwo(session)
    return runLevelThree(session)
  }
  return session
}

function isLabLevel(value: unknown): value is LabLevel {
  return value === 1 || value === 2 || value === 3
}

function isTool(value: unknown): value is LabTool {
  return value === 'test-probe' || value === 'class-probe' || value === 'environment-switch'
}

export function readLabV2Session(storage: Pick<Storage, 'getItem'>): LabV2Session {
  try {
    const raw = storage.getItem(LAB_V2_SESSION_KEY)
    if (!raw) return createLabV2Session()
    const parsed = JSON.parse(raw) as Partial<LabV2Session>
    if (parsed.version !== 1 || !isLabLevel(parsed.level) || !isLabLevel(parsed.unlockedLevel)) return createLabV2Session()
    const completedLevels = Array.isArray(parsed.completedLevels) ? parsed.completedLevels.filter(isLabLevel) : []
    const unlockedTools = Array.isArray(parsed.unlockedTools) ? parsed.unlockedTools.filter(isTool) : []
    const installedTools = Array.isArray(parsed.installedTools) ? parsed.installedTools.filter(isTool).filter((tool) => unlockedTools.includes(tool)) : []
    return {
      ...createLabV2Session(),
      ...parsed,
      completedLevels,
      unlockedTools,
      installedTools,
      shiftPasses: parsed.shiftPasses ?? {},
      lastRun: undefined,
    }
  } catch {
    return createLabV2Session()
  }
}

export function writeLabV2Session(storage: Pick<Storage, 'setItem'>, session: LabV2Session) {
  try {
    storage.setItem(LAB_V2_SESSION_KEY, JSON.stringify({ ...session, lastRun: undefined }))
    return true
  } catch {
    return false
  }
}
