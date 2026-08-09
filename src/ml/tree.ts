import type { Classifier, FittedClassifier, Label, Point2D, PointInput } from './types'

type Axis = 'x' | 'y'

type Leaf = { kind: 'leaf'; label: Label; samples: number }
type Branch = {
  kind: 'branch'
  axis: Axis
  threshold: number
  left: Node
  right: Node
  samples: number
}
type Node = Leaf | Branch

function majority(points: Point2D[]): Label {
  const cats = points.filter((point) => point.label === 'cat').length
  return cats * 2 >= points.length ? 'cat' : 'bread'
}

function gini(points: Point2D[]): number {
  if (points.length === 0) return 0
  const cats = points.filter((point) => point.label === 'cat').length / points.length
  const breads = 1 - cats
  return 1 - cats ** 2 - breads ** 2
}

function weightedGini(left: Point2D[], right: Point2D[]): number {
  const total = left.length + right.length
  return (left.length / total) * gini(left) + (right.length / total) * gini(right)
}

function candidateThresholds(points: Point2D[], axis: Axis): number[] {
  const values = [...new Set(points.map((point) => point[axis]))].sort((a, b) => a - b)
  const thresholds: number[] = []
  for (let i = 0; i < values.length - 1; i += 1) {
    thresholds.push((values[i] + values[i + 1]) / 2)
  }
  return thresholds
}

function build(points: Point2D[], depth: number, maxDepth: number): Node {
  const first = points[0]?.label
  const pure = points.every((point) => point.label === first)
  if (points.length === 0) throw new Error('Cannot build tree from no points')
  if (depth >= maxDepth || pure) return { kind: 'leaf', label: majority(points), samples: points.length }

  let best:
    | { axis: Axis; threshold: number; score: number; left: Point2D[]; right: Point2D[] }
    | undefined

  for (const axis of ['x', 'y'] as const) {
    for (const threshold of candidateThresholds(points, axis)) {
      const left = points.filter((point) => point[axis] <= threshold)
      const right = points.filter((point) => point[axis] > threshold)
      if (left.length === 0 || right.length === 0) continue
      const score = weightedGini(left, right)
      if (!best || score < best.score - 1e-12) {
        best = { axis, threshold, score, left, right }
      }
    }
  }

  if (!best || best.score >= gini(points) - 1e-12) {
    return { kind: 'leaf', label: majority(points), samples: points.length }
  }

  return {
    kind: 'branch',
    axis: best.axis,
    threshold: best.threshold,
    left: build(best.left, depth + 1, maxDepth),
    right: build(best.right, depth + 1, maxDepth),
    samples: points.length,
  }
}

function predictNode(node: Node, point: PointInput): Label {
  if (node.kind === 'leaf') return node.label
  return predictNode(point[node.axis] <= node.threshold ? node.left : node.right, point)
}

function depthOf(node: Node): number {
  if (node.kind === 'leaf') return 0
  return 1 + Math.max(depthOf(node.left), depthOf(node.right))
}

export class DecisionTreeClassifier implements Classifier {
  readonly id = 'tree'
  readonly name = '浅层决策树'
  readonly complexity = 2

  constructor(readonly maxDepth = 2) {}

  fit(points: Point2D[]): FittedClassifier {
    const root = build(points, 0, this.maxDepth)
    const actualDepth = depthOf(root)
    return {
      modelId: this.id,
      complexity: this.complexity,
      predict(point: PointInput) {
        return predictNode(root, point)
      },
      describe: () => ({ maxDepth: this.maxDepth, actualDepth, tree: JSON.stringify(root) }),
    }
  }
}
