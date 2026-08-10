import { STORY_CASE_001 } from '../bureau/catalog'
import type { Stage } from '../game/types'
import type { FeatureKey } from '../ml/types'
import type { ModelId } from '../ml/registry'

export const LEVEL_META = {
  id: 'lost-classifier',
  title: STORY_CASE_001.title,
  incident: '校园流浪动物识别机器人，把橘猫识别成了面包。',
  successTestAccuracy: 0.84,
  maxOrangeCatErrors: 1,
} as const

export const INITIAL_FEATURES: readonly [FeatureKey, FeatureKey] = ['warmth', 'roundness']

export const STAGE_CONTENT: Record<
  Stage,
  { role: string; step: string; task: string; assistant: string }
> = {
  briefing: {
    role: '新人调查员',
    step: '事故简报',
    task: '先接下任务。你不需要会公式，也不需要写代码。',
    assistant: '小析：先看看机器人究竟看到了什么。',
  },
  inspect_data: {
    role: '现场调查员',
    step: '翻旧样本档案',
    task: '先看机器人以前见过什么。',
    assistant: '小析：这些是它以前见过的猫和面包。先别管术语，只看它们怎么聚在一起。',
  },
  choose_features: {
    role: '传感器调查员',
    step: '读取机器人的眼睛',
    task: '弄清它当前只看哪两项信息。',
    assistant: '小析：它并没有像你一样“看懂一只猫”，这里只剩下几个数字。',
  },
  choose_model: {
    role: '模型工程师',
    step: '装上第一把判断工具',
    task: '亲手点一下直线分类器。',
    assistant: '小析：它只会画一条线。简单，但正好适合做第一份基准。',
  },
  train: {
    role: '模型工程师',
    step: '第一次训练',
    task: '点击训练，观察边界和旧样本上的结果。',
    assistant: '小析：训练结果会直接画在图上。',
  },
  first_success: {
    role: '模型工程师',
    step: '第一次成功？',
    task: '先预测：旧样本不错，是否代表现场真的修好了？',
    assistant: '小析：先留下你的判断。对不对不重要，我们马上拿新样本验证。',
  },
  hidden_test: {
    role: '系统审计员',
    step: '未知样本挑战',
    task: '让当前模型处理一批从未参与训练的新样本。',
    assistant: '小析：这次不能靠记住旧样本。',
  },
  inspect_errors: {
    role: '证据调查员',
    step: '建立错误证据链',
    task: '调查两个不同误判，再判断它们共同暴露了什么。',
    assistant: '小析：别急着改。先看两个错误，找它们共同骗过机器人的地方。',
  },
  iterate: {
    role: '联合修复',
    step: '设计并验证方案',
    task: '用案件证据设计下一次实验。',
    assistant: '小析：每次训练只是一次实验。案件记录会帮你比较“旧样本”和“新样本”。',
  },
  overfit_reveal: {
    role: '系统审计员',
    step: '发现陷阱',
    task: '它几乎记住了训练样本，却在未知样本上退步了。',
    assistant: '小析：这种过度迎合训练数据的现象，叫“过拟合”。',
  },
  final_audit: {
    role: '事故调查员',
    step: '系统修复',
    task: '未知样本表现已经稳定，关键橘猫也不再频繁被误判。',
    assistant: '小析：你不是追到了最高训练分，而是修好了真实问题。',
  },
  transfer_question: {
    role: '事故调查员',
    step: '迁移判断',
    task: '最后一个问题：把刚才的经验带到另一个场景。',
    assistant: '小析：不用背术语，按你刚才真正做过的事判断。',
  },
  complete: {
    role: 'AI事故调查员',
    step: '调查完成',
    task: '事故关闭。你已经亲手经历了训练、测试、泛化与过拟合。',
    assistant: '小析：下一次遇到“旧题全对、新题崩掉”，你知道该查什么了。',
  },
}

export const TRANSFER_QUESTION = {
  prompt: '一个模型在练习题上全部答对，但换一批题就频繁出错。最应该先检查什么？',
  options: [
    { id: 'more-training-score', label: '继续把练习题分数刷得更高', correct: false },
    { id: 'new-errors', label: '检查新题里的错误案例和数据差异', correct: true },
    { id: 'bigger-model', label: '直接换成最复杂的模型', correct: false },
  ],
  explanation: '先检查未知数据上的错误，才能知道模型是否只适应了练习题。',
} as const

export function unlockedModels(hasSeenOverfit: boolean): ModelId[] {
  return hasSeenOverfit ? ['linear', 'tree', 'knn-1', 'knn-5'] : ['linear', 'knn-1']
}
