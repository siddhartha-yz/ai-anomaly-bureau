import type { Label } from '../ml/types'

export function PixelSampleGlyph({
  label,
  x,
  y,
  scale = 1,
  className = '',
}: {
  label: Label
  x: number
  y: number
  scale?: number
  className?: string
}) {
  const transform = `translate(${x} ${y}) scale(${scale})`
  if (label === 'cat') {
    return (
      <g transform={transform} className={`pixel-data-glyph cat-glyph ${className}`} shapeRendering="crispEdges">
        <rect x="-7" y="-7" width="4" height="4" className="glyph-main" />
        <rect x="3" y="-7" width="4" height="4" className="glyph-main" />
        <rect x="-7" y="-3" width="14" height="8" className="glyph-main" />
        <rect x="-5" y="5" width="10" height="3" className="glyph-main" />
        <rect x="-4" y="-1" width="2" height="2" className="glyph-cut" />
        <rect x="2" y="-1" width="2" height="2" className="glyph-cut" />
        <rect x="-1" y="2" width="2" height="2" className="glyph-cut" />
      </g>
    )
  }

  return (
    <g transform={transform} className={`pixel-data-glyph bread-glyph ${className}`} shapeRendering="crispEdges">
      <rect x="-6" y="-5" width="12" height="11" className="glyph-main" />
      <rect x="-4" y="-7" width="8" height="3" className="glyph-main" />
      <rect x="-4" y="-3" width="3" height="3" className="glyph-cut" />
      <rect x="2" y="0" width="2" height="3" className="glyph-cut" />
      <rect x="-6" y="6" width="12" height="2" className="glyph-shadow" />
    </g>
  )
}

export function PixelUnknownGlyph({ x, y, selected = false }: { x: number; y: number; selected?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className={`pixel-unknown-glyph ${selected ? 'selected' : ''}`} shapeRendering="crispEdges">
      <rect x="-5" y="-5" width="10" height="10" className="unknown-core" transform="rotate(45)" />
      <rect x="-1" y="-4" width="2" height="5" className="unknown-mark" />
      <rect x="-1" y="3" width="2" height="2" className="unknown-mark" />
    </g>
  )
}

export function PixelEvidenceSprite({ label }: { label: Label }) {
  return (
    <svg viewBox="0 0 64 64" className={`evidence-sprite ${label}`} aria-hidden="true">
      <rect x="1" y="1" width="62" height="62" className="evidence-screen" />
      {label === 'cat' ? (
        <g shapeRendering="crispEdges" className="evidence-cat">
          <rect x="16" y="13" width="9" height="9" className="sprite-main" />
          <rect x="39" y="13" width="9" height="9" className="sprite-main" />
          <rect x="14" y="21" width="36" height="24" className="sprite-main" />
          <rect x="20" y="45" width="24" height="7" className="sprite-main" />
          <rect x="22" y="28" width="6" height="6" className="sprite-dark" />
          <rect x="36" y="28" width="6" height="6" className="sprite-dark" />
          <rect x="29" y="37" width="6" height="5" className="sprite-light" />
        </g>
      ) : (
        <g shapeRendering="crispEdges" className="evidence-bread">
          <rect x="14" y="19" width="36" height="31" className="sprite-main" />
          <rect x="20" y="13" width="24" height="9" className="sprite-main" />
          <rect x="20" y="26" width="8" height="7" className="sprite-light" />
          <rect x="36" y="35" width="7" height="8" className="sprite-dark" />
          <rect x="14" y="49" width="36" height="4" className="sprite-shadow" />
        </g>
      )}
    </svg>
  )
}
