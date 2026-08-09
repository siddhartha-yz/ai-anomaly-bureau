export function PixelCat() {
  return (
    <svg className="pixel-sprite pixel-cat" viewBox="0 0 64 64" role="img" aria-label="像素橘猫">
      <g shapeRendering="crispEdges">
        <rect x="12" y="16" width="8" height="8" />
        <rect x="44" y="16" width="8" height="8" />
        <rect x="16" y="12" width="8" height="8" />
        <rect x="40" y="12" width="8" height="8" />
        <rect x="16" y="20" width="32" height="28" />
        <rect x="20" y="48" width="8" height="8" />
        <rect x="36" y="48" width="8" height="8" />
        <rect className="pixel-shadow" x="20" y="24" width="8" height="8" />
        <rect className="pixel-shadow" x="36" y="24" width="8" height="8" />
        <rect className="pixel-eye" x="22" y="26" width="4" height="4" />
        <rect className="pixel-eye" x="38" y="26" width="4" height="4" />
        <rect className="pixel-muzzle" x="28" y="34" width="8" height="4" />
        <rect className="pixel-stripe" x="28" y="20" width="8" height="4" />
        <rect className="pixel-stripe" x="16" y="32" width="8" height="4" />
        <rect className="pixel-stripe" x="40" y="32" width="8" height="4" />
      </g>
    </svg>
  )
}

export function PixelScanner() {
  return (
    <svg className="pixel-sprite pixel-scanner" viewBox="0 0 72 72" role="img" aria-label="像素识别机器人">
      <g shapeRendering="crispEdges">
        <rect className="scanner-back" x="16" y="16" width="40" height="36" />
        <rect className="scanner-shell" x="12" y="20" width="48" height="28" />
        <rect className="scanner-screen" x="20" y="24" width="32" height="16" />
        <rect className="scanner-eye" x="26" y="29" width="6" height="4" />
        <rect className="scanner-eye" x="40" y="29" width="6" height="4" />
        <rect className="scanner-leg" x="22" y="52" width="8" height="8" />
        <rect className="scanner-leg" x="42" y="52" width="8" height="8" />
        <rect className="scanner-ear" x="8" y="26" width="4" height="12" />
        <rect className="scanner-ear" x="60" y="26" width="4" height="12" />
        <rect className="scanner-light" x="32" y="10" width="8" height="6" />
      </g>
    </svg>
  )
}

export function PixelBread() {
  return (
    <svg className="pixel-sprite pixel-bread" viewBox="0 0 64 64" role="img" aria-label="像素面包">
      <g shapeRendering="crispEdges">
        <rect x="12" y="24" width="40" height="28" />
        <rect x="16" y="16" width="32" height="12" />
        <rect className="bread-light" x="20" y="20" width="8" height="8" />
        <rect className="bread-light" x="36" y="20" width="8" height="8" />
        <rect className="bread-crumb" x="20" y="34" width="6" height="6" />
        <rect className="bread-crumb" x="36" y="38" width="6" height="6" />
      </g>
    </svg>
  )
}

export function IncidentScene() {
  return (
    <section className="pixel-incident-stage" aria-label="事故现场：橘猫被识别机器人错误识别为面包">
      <div className="terminal-titlebar">
        <span className="terminal-dots"><i /><i /><i /></span>
        <span>CASE_001 / LIVE_CAPTURE.EXE</span>
        <span className="terminal-state">REC ●</span>
      </div>

      <div className="incident-stage-grid">
        <div className="scene-entity">
          <span className="entity-label">INPUT / UNKNOWN</span>
          <div className="sprite-platform cat-platform"><PixelCat /></div>
          <strong>橘猫</strong>
        </div>

        <div className="scene-flow">
          <span className="flow-pixel">···▶</span>
          <small>CAMERA FEED</small>
        </div>

        <div className="scene-entity scanner-entity">
          <span className="entity-label">STRAY-VISION 2.1</span>
          <div className="sprite-platform scanner-platform"><PixelScanner /></div>
          <strong>识别中...</strong>
          <div className="scan-beam" />
        </div>

        <div className="scene-flow error-flow">
          <span className="flow-pixel">▶ !!</span>
          <small>87% CONF.</small>
        </div>

        <div className="scene-entity result-entity">
          <span className="entity-label error-label">MODEL OUTPUT</span>
          <div className="sprite-platform bread-platform"><PixelBread /></div>
          <strong>面包？</strong>
        </div>
      </div>

      <div className="incident-alert">
        <span className="alert-icon">!</span>
        <div>
          <strong>分类异常：CAT → BREAD</strong>
          <p>机器人很自信，但它错了。找出它究竟依据了什么。</p>
        </div>
      </div>
    </section>
  )
}
