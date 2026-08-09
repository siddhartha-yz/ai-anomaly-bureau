import type { Classifier, FittedClassifier, Label, Point2D, PointInput } from './types'

function mean(points: Point2D[]): PointInput {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

export class LinearClassifier implements Classifier {
  readonly id = 'linear'
  readonly name = '直线分类器'
  readonly complexity = 1

  fit(points: Point2D[]): FittedClassifier {
    const cats = points.filter((point) => point.label === 'cat')
    const breads = points.filter((point) => point.label === 'bread')
    if (cats.length === 0 || breads.length === 0) {
      throw new Error('Linear classifier requires both classes')
    }

    const catMean = mean(cats)
    const breadMean = mean(breads)
    const wx = catMean.x - breadMean.x
    const wy = catMean.y - breadMean.y
    const midX = (catMean.x + breadMean.x) / 2
    const midY = (catMean.y + breadMean.y) / 2
    const threshold = wx * midX + wy * midY
    const score = (point: PointInput) => wx * point.x + wy * point.y

    return {
      modelId: this.id,
      complexity: this.complexity,
      predict(point: PointInput): Label {
        return score(point) >= threshold ? 'cat' : 'bread'
      },
      describe() {
        return {
          wx: Number(wx.toFixed(4)),
          wy: Number(wy.toFixed(4)),
          threshold: Number(threshold.toFixed(4)),
          catMeanX: Number(catMean.x.toFixed(4)),
          catMeanY: Number(catMean.y.toFixed(4)),
          breadMeanX: Number(breadMean.x.toFixed(4)),
          breadMeanY: Number(breadMean.y.toFixed(4)),
        }
      },
    }
  }
}
