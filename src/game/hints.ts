import type { GameState } from './types'

export function hintFor(state: GameState): string {
  const level = state.hintLevel
  if (level === 0) return '需要时可以请求提示；连续失败后，小析也会逐步说得更具体。'

  if (state.stage === 'inspect_errors') {
    if (level === 1) return '先点开误判，看看橘猫与面包在哪两项信息上变得相似。'
    if (level === 2) return '你现在选的特征可能把“圆”当成了猫的捷径。试着换一项信息。'
    return '未知样本改变了外形分布。保留稳定特征，再比较简单与复杂模型的测试表现。'
  }

  if (state.stage === 'iterate' && !state.hasSeenOverfit) {
    if (level === 1) return '有个新模型能把训练样本几乎全部记住。先看看满分是否真的可靠。'
    if (level === 2) return '试试 K近邻 k=1；训练后一定要再做未知样本审计。'
    return 'k=1 只听最近一个旧样本，噪声也会被记住。训练满分仍需要测试集验证。'
  }

  if (state.stage === 'iterate') {
    if (level === 1) return '别只看训练表现。对比未知数据错误数，并点开错误样本。'
    if (level === 2) return '“表面纹理 + 长宽比例”比“暖度 + 圆度”更不容易被橘猫和圆面包骗过。'
    return '换更稳健的特征，并尝试直线、浅树或 k=5，让边界别追着少量噪声拐弯。'
  }

  if (level === 1) return '先看当前任务句，再观察图上发生了什么变化。'
  if (level === 2) return '只改一个决定：特征或模型，然后比较修改前后的结果。'
  return '如果卡住，优先选择两项能稳定区分猫和面包的信息，再用简单模型训练。'
}
