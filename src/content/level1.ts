import type { Stage } from '../game/types'
import type { FeatureKey } from '../ml/types'
import type { ModelId } from '../ml/registry'

export const LEVEL_META = {
  id: 'lost-classifier',
  title: '失控的分类器',
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
    role: '数据调查员',
    step: '观察样本',
    task: '观察猫与面包的位置。哪些地方看起来最容易分开？',
    assistant: '小析：先找规律，不必给它起专业名字。',
  },
  choose_features: {
    role: '特征工程师',
    step: '决定模型看什么',
    task: '选择两项信息。散点图会变成模型真正看到的世界。',
    assistant: '小析：模型看不到你没给它的东西。',
  },
  choose_model: {
    role: '模型工程师',
    step: '选择判断方式',
    task: '先用最简单的直线分类器试一次。',
    assistant: '小析：先让系统跑起来，再谈更复杂的方法。',
  },
  train: {
    role: '模型工程师',
    step: '第一次训练',
    task: '点击训练，观察边界和旧样本上的结果。',
    assistant: '小析：训练结果会直接画在图上。',
  },
  first_success: {
    role: '模型工程师',
    step: '第一次成功',
    task: '你已经让机器人在现有样本上工作了。现在接受一次现场抽查。',
    assistant: '小析：先别急着庆功。总部刚送来一批没见过的样本。',
  },
  hidden_test: {
    role: '系统审计员',
    step: '未知样本挑战',
    task: '让当前模型处理一批从未参与训练的新样本。',
    assistant: '小析：这次不能靠记住旧样本。',
  },
  inspect_errors: {
    role: '系统审计员',
    step: '检查误判',
    task: '至少点开一个误判。先看它为什么骗过了模型。',
    assistant: '小析：一个错误样本，往往比一个总分更有信息。',
  },
  iterate: {
    role: '联合修复',
    step: '重新设计',
    task: '修改特征或模型，训练后再次审计。不要只盯着训练分数。',
    assistant: '小析：比较“旧样本表现”和“未知样本表现”。',
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
