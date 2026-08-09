import type { DecisionCell, Evaluation, FittedClassifier, Point2D } from './types'

export function evaluate(model: FittedClassifier, points: Point2D[]): Evaluation {
  const predictions = points.map((point) => {
    const predicted = model.predict(point)
    return {
      id: point.id,
      actual: point.label,
      predicted,
      correct: predicted === point.label,
    }
  })
  const mistakes = predictions.filter((prediction) => !prediction.correct)
  const confusion: Evaluation['confusion'] = {
    'cat->cat': 0,
    'cat->bread': 0,
    'bread->cat': 0,
    'bread->bread': 0,
  }
  for (const prediction of predictions) {
    confusion[`${prediction.actual}->${prediction.predicted}`] += 1
  }
  return {
    accuracy: predictions.length === 0 ? 0 : (predictions.length - mistakes.length) / predictions.length,
    errorCount: mistakes.length,
    predictions,
    mistakes,
    confusion,
  }
}

export function createDecisionGrid(
  model: FittedClassifier,
  resolution = 28,
  min = 0,
  max = 1,
): DecisionCell[] {
  if (!Number.isInteger(resolution) || resolution < 2) throw new Error('resolution must be >= 2')
  const cells: DecisionCell[] = []
  for (let iy = 0; iy < resolution; iy += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      const x = min + ((ix + 0.5) / resolution) * (max - min)
      const y = min + ((iy + 0.5) / resolution) * (max - min)
      cells.push({ x, y, label: model.predict({ x, y }) })
    }
  }
  return cells
}
