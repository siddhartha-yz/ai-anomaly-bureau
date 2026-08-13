import type { SimulatorGraph } from './types'

export type GraphHistory = {
  past: SimulatorGraph[]
  present: SimulatorGraph
  future: SimulatorGraph[]
}

const HISTORY_LIMIT = 80

export function createGraphHistory(graph: SimulatorGraph): GraphHistory {
  return { past: [], present: graph, future: [] }
}

function trimPast(past: SimulatorGraph[]) {
  return past.length <= HISTORY_LIMIT ? past : past.slice(past.length - HISTORY_LIMIT)
}

export function applyGraphEdit(history: GraphHistory, next: SimulatorGraph): GraphHistory {
  if (next === history.present) return history
  return {
    past: trimPast([...history.past, history.present]),
    present: next,
    future: [],
  }
}

export function replaceGraphPresent(history: GraphHistory, next: SimulatorGraph): GraphHistory {
  if (next === history.present) return history
  return { ...history, present: next }
}

export function recordGraphSnapshot(history: GraphHistory, snapshot: SimulatorGraph): GraphHistory {
  if (snapshot === history.present) return history
  return {
    past: trimPast([...history.past, snapshot]),
    present: history.present,
    future: [],
  }
}

export function undoGraph(history: GraphHistory): GraphHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoGraph(history: GraphHistory): GraphHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: trimPast([...history.past, history.present]),
    present: next,
    future: history.future.slice(1),
  }
}
