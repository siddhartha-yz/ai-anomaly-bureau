import type { Classifier, FittedClassifier, Label, Point2D, PointInput } from './types'

export class KnnClassifier implements Classifier {
  readonly id: string
  readonly name: string
  readonly complexity: number

  constructor(readonly k: number) {
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer')
    this.id = `knn-${k}`
    this.name = `K近邻 · k=${k}`
    this.complexity = k === 1 ? 4 : 2
  }

  fit(points: Point2D[]): FittedClassifier {
    if (points.length < this.k) throw new Error('Not enough points for KNN')
    const training = points.map((point) => ({ x: point.x, y: point.y, label: point.label, id: point.id }))
    const k = this.k

    return {
      modelId: this.id,
      complexity: this.complexity,
      predict(point: PointInput): Label {
        const nearest = training
          .map((item) => ({
            ...item,
            distance: (item.x - point.x) ** 2 + (item.y - point.y) ** 2,
          }))
          .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
          .slice(0, k)
        const catVotes = nearest.filter((item) => item.label === 'cat').length
        const breadVotes = k - catVotes
        if (catVotes === breadVotes) return nearest[0].label
        return catVotes > breadVotes ? 'cat' : 'bread'
      },
      describe() {
        return { k, trainingPoints: training.length, metric: 'euclidean' }
      },
    }
  }
}
