import { KnnClassifier } from './knn'
import { LinearClassifier } from './linear'
import { DecisionTreeClassifier } from './tree'
import type { Classifier } from './types'

export type ModelId = 'linear' | 'tree' | 'knn-1' | 'knn-5'

export const MODEL_REGISTRY: Record<ModelId, Classifier> = {
  linear: new LinearClassifier(),
  tree: new DecisionTreeClassifier(2),
  'knn-1': new KnnClassifier(1),
  'knn-5': new KnnClassifier(5),
}

export const MODEL_META: Record<
  ModelId,
  { label: string; nickname: string; description: string; complexityLabel: string }
> = {
  linear: {
    label: '直线分类器',
    nickname: '画一条线',
    description: '用一条直线把两类样本分开。简单、稳定。',
    complexityLabel: '低',
  },
  tree: {
    label: '浅层决策树',
    nickname: '问两个问题',
    description: '最多连续问两个“高于还是低于阈值”的问题。',
    complexityLabel: '中',
  },
  'knn-1': {
    label: 'K近邻 · k=1',
    nickname: '只信最近一个',
    description: '每次只参考最近的训练样本，几乎能记住全部训练点。',
    complexityLabel: '很高',
  },
  'knn-5': {
    label: 'K近邻 · k=5',
    nickname: '听附近五个',
    description: '让附近五个训练样本投票，边界通常更平滑。',
    complexityLabel: '中',
  },
}
