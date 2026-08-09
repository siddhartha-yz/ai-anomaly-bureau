export type Label = 'cat' | 'bread'
export type Split = 'train' | 'test'

export type RawFeatures = {
  warmth: number
  roundness: number
  texture: number
  aspect: number
}

export type FeatureKey = keyof RawFeatures

export type SampleFlags = {
  noise?: boolean
  outlier?: boolean
  orangeCat?: boolean
  roundBread?: boolean
  auditProbe?: boolean
}

export type Sample = {
  id: string
  split: Split
  label: Label
  features: RawFeatures
  flags?: SampleFlags
}

export type PublicSample = Omit<Sample, 'label'> & { label?: Label }

export type Point2D = {
  id: string
  x: number
  y: number
  label: Label
  source: Sample
}

export type PointInput = Pick<Point2D, 'x' | 'y'>

export interface FittedClassifier {
  readonly modelId: string
  readonly complexity: number
  predict(point: PointInput): Label
  describe(): Record<string, number | string | boolean>
}

export interface Classifier {
  readonly id: string
  readonly name: string
  readonly complexity: number
  fit(points: Point2D[]): FittedClassifier
}

export type Prediction = {
  id: string
  actual: Label
  predicted: Label
  correct: boolean
}

export type Evaluation = {
  accuracy: number
  errorCount: number
  predictions: Prediction[]
  mistakes: Prediction[]
  confusion: Record<`${Label}->${Label}`, number>
}

export type DecisionCell = {
  x: number
  y: number
  label: Label
}
