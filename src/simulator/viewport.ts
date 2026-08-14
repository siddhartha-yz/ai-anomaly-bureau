export type SimulatorViewport = {
  zoom: number
  panX: number
  panY: number
}

export const MIN_SIM_ZOOM = 0.3
export const MAX_SIM_ZOOM = 1.6

export function clampSimulatorZoom(zoom: number) {
  return Math.max(MIN_SIM_ZOOM, Math.min(MAX_SIM_ZOOM, zoom))
}

export function zoomViewportAtPoint(
  viewport: SimulatorViewport,
  nextZoomRaw: number,
  pointerX: number,
  pointerY: number,
): SimulatorViewport {
  const nextZoom = clampSimulatorZoom(nextZoomRaw)
  if (nextZoom === viewport.zoom) return viewport
  const worldX = (pointerX - viewport.panX) / viewport.zoom
  const worldY = (pointerY - viewport.panY) / viewport.zoom
  return {
    zoom: nextZoom,
    panX: pointerX - worldX * nextZoom,
    panY: pointerY - worldY * nextZoom,
  }
}

export function panViewport(viewport: SimulatorViewport, dx: number, dy: number): SimulatorViewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy }
}

export function fitViewport(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
  padding = 32,
): SimulatorViewport {
  const usableWidth = Math.max(1, viewportWidth - padding * 2)
  const usableHeight = Math.max(1, viewportHeight - padding * 2)
  const zoom = clampSimulatorZoom(Math.min(usableWidth / worldWidth, usableHeight / worldHeight))
  return {
    zoom,
    panX: (viewportWidth - worldWidth * zoom) / 2,
    panY: (viewportHeight - worldHeight * zoom) / 2,
  }
}
