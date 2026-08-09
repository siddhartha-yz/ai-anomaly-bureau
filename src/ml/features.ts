import type { FeatureKey, Point2D, Sample } from './types'

export const FEATURE_META: Record<FeatureKey, { label: string; short: string; description: string }> = {
  warmth: {
    label: '颜色暖度',
    short: '暖度',
    description: '越靠近橙黄越高。橘猫和烤面包都可能很高。',
  },
  roundness: {
    label: '轮廓圆度',
    short: '圆度',
    description: '轮廓越接近圆形越高。侧身猫和圆面包会制造麻烦。',
  },
  texture: {
    label: '表面纹理',
    short: '纹理',
    description: '毛发与面包表面的粗细差异，存在少量测量噪声。',
  },
  aspect: {
    label: '长宽比例',
    short: '长宽比',
    description: '越细长越高。对长条面包很有帮助。',
  },
}

export const ALL_FEATURES = Object.keys(FEATURE_META) as FeatureKey[]

export function projectSamples(samples: Sample[], features: readonly [FeatureKey, FeatureKey]): Point2D[] {
  const [xKey, yKey] = features
  return samples.map((sample) => ({
    id: sample.id,
    x: sample.features[xKey],
    y: sample.features[yKey],
    label: sample.label,
    source: sample,
  }))
}
