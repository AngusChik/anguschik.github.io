import React, { useState, useEffect } from "react"

/**
 * RouteInsightsBasic
 * ------------------
 * Small elevation profile card that updates when the active route changes.
 * Works with multiple selectable ORS routes.
 */
export default function RouteInsightsBasic({ i, onScrub, onSelect }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const [hoverX, setHoverX] = useState(null)

  // reset hover when route changes
  useEffect(() => {
    setHoverIdx(null)
    setHoverX(null)
  }, [i])

  if (!i) return null

  const {
    distKm = [],
    elevM = [],
    totalDistM = 0,
    ascentM = 0,
    descentM = 0,
    avgSpeedKph = 0,
    etaMin = 0,
  } = i

  if (!distKm.length || !elevM.length) return null

  // --- Style palette (match BikeSafeMap dark panel)
  const BG = "#0b1220"
  const INK = "#e6efff"
  const SUB = "#9fb1c7"
  const LINE = "#60a5fa"
  const GRID = "#1f2a40"

  const W = 320, H = 100, P = 10

  // --- Scale helpers
  const minE = Math.min(...elevM)
  const maxE = Math.max(...elevM)
  const spanE = Math.max(1, maxE - minE)
  const startKm = distKm[0] ?? 0
  const endKm = distKm[distKm.length - 1] ?? 1
  const spanX = Math.max(0.000001, endKm - startKm)

  const x = (km) => P + ((km - startKm) / spanX) * (W - P * 2)
  const y = (m) => H - P - ((m - minE) / spanE) * (H - P * 2)

  // --- Build polyline path
  let pathD = ""
  for (let j = 0; j < distKm.length; j++) {
    const cmd = j === 0 ? "M" : "L"
    pathD += `${cmd}${x(distKm[j]).toFixed(1)},${y(elevM[j]).toFixed(1)}`
  }

  // --- Mouse interactions
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
  const kmFromSvgX = (svgX) => {
    const t = clamp(svgX, P, W - P)
    const ratio = (t - P) / (W - 2 * P)
    return startKm + ratio * spanX
  }
  const nearestIndex = (km) => {
    let best = 0
    let bestDiff = Math.abs(distKm[0] - km)
    for (let j = 1; j < distKm.length; j++) {
      const d = Math.abs(distKm[j] - km)
      if (d < bestDiff) { best = j; bestDiff = d }
    }
    return best
  }

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const svgX = (px / rect.width) * W
    const km = kmFromSvgX(svgX)
    const idx = nearestIndex(km)
    setHoverIdx(idx)
    setHoverX(x(km))
    onScrub && onScrub(km)
  }

  function handleLeave() {
    setHoverIdx(null)
    setHoverX(null)
  }

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const svgX = (px / rect.width) * W
    const km = kmFromSvgX(svgX)
    onSelect && onSelect(km)
  }

  // --- Hover visuals
  const showHover = hoverIdx != null && hoverX != null
  const hx = showHover ? clamp(hoverX, P, W - P) : 0
  const hy = showHover ? y(elevM[hoverIdx]) : 0
  const hKm = showHover ? distKm[hoverIdx] : 0
  const hElev = showHover ? elevM[hoverIdx] : 0
  const TIP_W = 130, TIP_H = 24
  const tipX = Math.min(W - P - TIP_W, Math.max(P, hx + 6))
  const tipY = P + 2

  return (
    <div
      style={{
        marginTop: 10,
        background: BG,
        border: "1px solid #1f2a40",
        borderRadius: 10,
        padding: 10,
        color: INK,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <b>Route insights</b>
        <span style={{ color: SUB, fontSize: 12 }}>Distance / Elevation</span>
      </div>

      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", cursor: "crosshair", background: "#0b1220", borderRadius: 6 }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      >
        <rect x="0" y="0" width={W} height={H} fill="#0b1220" rx="6" />
        <line
          x1={P}
          x2={W - P}
          y1={Math.round(H / 2)}
          y2={Math.round(H / 2)}
          stroke={GRID}
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <path d={pathD} fill="none" stroke={LINE} strokeWidth="2" />
        <text x={P} y={y(maxE) - 4} fontSize="10" fill={SUB}>
          {Math.round(maxE)} m
        </text>
        <text x={P} y={y(minE) + 12} fontSize="10" fill={SUB}>
          {Math.round(minE)} m
        </text>

        {showHover && (
          <>
            <line x1={hx} x2={hx} y1={P} y2={H - P} stroke={SUB} strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={x(distKm[hoverIdx])} cy={hy} r="3" fill={LINE} />
            <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx="4" fill="#111827" stroke="#223048" />
            <text x={tipX + 8} y={tipY + 11} fontSize="10" fill={SUB}>
              {hKm.toFixed(2)} km
            </text>
            <text x={tipX + 70} y={tipY + 11} fontSize="10" fill={SUB}>
              {Math.round(hElev)} m
            </text>
          </>
        )}
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        <div>
          <span style={{ color: SUB }}>Distance</span><br />
          <b>{(totalDistM / 1000).toFixed(2)} km</b>
        </div>
        <div>
          <span style={{ color: SUB }}>Ascent / Descent</span><br />
          <b>{Math.round(ascentM)} m</b> / <b>{Math.round(descentM)} m</b>
        </div>
        <div>
          <span style={{ color: SUB }}>Suggested speed</span><br />
          <b>{avgSpeedKph.toFixed(1)} km/h</b>
        </div>
        <div>
          <span style={{ color: SUB }}>ETA</span><br />
          <b>{Math.round(etaMin)} min</b>
        </div>
      </div>
    </div>
  )
}
