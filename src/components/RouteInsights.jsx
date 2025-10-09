import React, { useMemo, useState } from 'react'

export default function RouteInsights({ i, onScrub, onSelect, bands = [] }) {
  if (!i) return null
  const { distKm, elevM, totalDistM, ascentM, descentM, avgSpeedKph, etaMin } = i

  // Palette (high-contrast)
  const COLORS = {
    panel:  '#0b1220',
    panel2: '#111826',
    border: '#2a3246',
    text:   '#e6efff',
    sub:    '#cfe1ff',
    line:   '#60a5fa',
    guide:  '#cfe1ff',
    risk:   { low:'#10b981', med:'#f59e0b', high:'#ef4444' }
  }

  // SVG sparkline (300x90, 12px padding)
  const W = 300, H = 90, P = 12
  const minE = Math.min(...elevM), maxE = Math.max(...elevM)
  const spanE = Math.max(1, maxE - minE)
  const spanX = Math.max(1e-6, distKm[distKm.length - 1] - distKm[0])

  const x = (km) => P + ((km - distKm[0]) / spanX) * (W - P * 2)
  const y = (m)  => H - P - ((m - minE) / spanE) * (H - P * 2)

  // Elevation path
  const pathD = useMemo(() => {
    let d = ''
    for (let i2 = 0; i2 < distKm.length; i2++) {
      const cmd = (i2 === 0) ? 'M' : 'L'
      d += `${cmd}${x(distKm[i2]).toFixed(1)},${y(elevM[i2]).toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distKm, elevM, spanX, spanE, minE])

  // Hover state
  const [hoverX, setHoverX] = useState(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)) }

  // nearest data index (binary search)
  function indexFromKm(km){
    let lo = 0, hi = distKm.length - 1
    while (lo < hi){
      const mid = (lo + hi) >> 1
      if (distKm[mid] < km) lo = mid + 1
      else hi = mid
    }
    const i = lo
    if (i === 0) return 0
    const prev = i - 1
    return (Math.abs(distKm[prev] - km) <= Math.abs(distKm[i] - km)) ? prev : i
  }

  function kmFromSvgX(svgX){
    const t = clamp(svgX, P, W - P)
    return distKm[0] + ((t - P) / (W - 2 * P)) * spanX
  }

  function handleMove(e){
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const svgX = (px / rect.width) * W
    const km = kmFromSvgX(svgX)

    const idx = indexFromKm(km)
    setHoverIdx(idx)
    setHoverX(x(km))
    onScrub?.(km)
  }

  function handleLeave(){
    setHoverIdx(null)
    setHoverX(null)
  }

  function handleClick(e){
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const svgX = (px / rect.width) * W
    const km = kmFromSvgX(svgX)
    onSelect?.(km)
  }

  const showHover = hoverIdx != null && hoverX != null
  const hx = showHover ? clamp(hoverX, P, W - P) : 0
  const hy = showHover ? y(elevM[hoverIdx]) : 0
  const hKm = showHover ? distKm[hoverIdx] : null
  const hElev = showHover ? elevM[hoverIdx] : null

  // Current band under cursor
  const hoveredBand = (showHover && Array.isArray(bands))
    ? bands.find(b => hKm >= b.fromKm && hKm <= b.toKm)
    : null
  const bandColor = hoveredBand ? COLORS.risk[hoveredBand.risk] : null
  const reasons = (hoveredBand?.reasons || []).slice(0, 5) // keep tooltip compact

  // Tooltip geometry
  const TIP_W = 178
  const BASE_H = 26             // when no band info
  const RISK_HDR_H = hoveredBand ? 16 : 0
  const REASONS_H = reasons.length ? (reasons.length * 11 + 6) : 0
  const ROAD_H = hoveredBand ? 14 : 0
  const TIP_H = hoveredBand ? (RISK_HDR_H + REASONS_H + ROAD_H + 10) : BASE_H

  const tipX = Math.min(W - P - TIP_W, Math.max(P, hx + 6))
  const tipTextX = tipX + 8
  let tipLineY = P + 11

  return (
    <div
      style={{
        marginTop:10,
        background: COLORS.panel2,
        border: `1px solid ${COLORS.border}`,
        borderRadius:12,
        padding:12,
        color: COLORS.text
      }}
    >
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
        <b>Route insights</b>
        <span style={{fontSize:12, color:COLORS.sub}}>Distance / Elevation</span>
      </div>

      <svg
        width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
        style={{display:'block', width:'100%', cursor:'crosshair'}}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      >
        {/* Background */}
        <rect x="0" y="0" width={W} height={H} fill={COLORS.panel} rx="8" />

        {/* Risk bands under the line */}
        {bands.map((b, i) => {
          const x1 = x(b.fromKm)
          const x2 = x(b.toKm)
          const w  = Math.max(0, x2 - x1)
          const fill = COLORS.risk[b.risk] || '#9ca3af'
          return (
            <rect
              key={i}
              x={x1} y={P}
              width={w} height={H - 2*P}
              fill={fill}
              fillOpacity="0.18"
              rx="2"
            />
          )
        })}

        {/* Elevation path */}
        <path d={pathD} fill="none" stroke={COLORS.line} strokeWidth="2" />

        {/* min / max labels */}
        <text x={P} y={y(maxE)-4} fontSize="10" fill={COLORS.sub}>{Math.round(maxE)} m</text>
        <text x={P} y={y(minE)+12} fontSize="10" fill={COLORS.sub}>{Math.round(minE)} m</text>

        {/* Hover guide + tooltip */}
        {showHover && (
          <>
            {/* Highlight current band bounds */}
            {hoveredBand && (
              <rect
                x={x(hoveredBand.fromKm)}
                y={P}
                width={Math.max(0, x(hoveredBand.toKm) - x(hoveredBand.fromKm))}
                height={H - 2*P}
                fill="none"
                stroke={bandColor}
                strokeOpacity="0.6"
                strokeWidth="1"
                rx="2"
              />
            )}

            {/* Cursor & dot */}
            <line x1={hx} y1={P} x2={hx} y2={H-P} stroke={COLORS.guide} strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={x(distKm[hoverIdx])} cy={hy} r="2.8" fill={COLORS.line} />

            {/* Tooltip container */}
            <rect
              x={tipX}
              y={P}
              width={TIP_W}
              height={TIP_H}
              rx="6"
              fill={COLORS.panel2}
              stroke={COLORS.border}
            />

            {/* Dist / Elev (always) */}
            <text x={tipTextX} y={tipLineY} fontSize="10" fill={COLORS.sub}>
              {(hKm ?? 0).toFixed(2)} km
            </text>
            <text x={tipTextX + 80} y={tipLineY} fontSize="10" fill={COLORS.sub}>
              {Math.round(hElev ?? 0)} m
            </text>

            {/* Risk header + reasons + road type — same info as the map popup */}
            {hoveredBand && (
              <>
                {/* Risk header */}
                <text x={tipTextX} y={(tipLineY += 14)} fontSize="10" fill={bandColor} fontWeight="700">
                  {hoveredBand.risk.toUpperCase()} RISK
                </text>

                {/* Reasons (bulleted) */}
                {reasons.map((r, i) => (
                  <text key={i} x={tipTextX} y={(tipLineY += 11)} fontSize="10" fill={COLORS.sub}>
                    • {r}
                  </text>
                ))}

                {/* Road type */}
                <text x={tipTextX} y={(tipLineY += 12)} fontSize="10" fill={COLORS.sub}>
                  Road: {hoveredBand.wayLabel}
                </text>
              </>
            )}
          </>
        )}
      </svg>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:8, fontSize:13}}>
        <div><span style={{color:COLORS.sub}}>Distance</span><br/><b>{(totalDistM/1000).toFixed(2)} km</b></div>
        <div>
          <span style={{color:COLORS.sub}}>Ascent / Descent</span><br/>
          <b>{Math.round(ascentM)} m</b> / <b>{Math.round(descentM)} m</b>
        </div>
        <div><span style={{color:COLORS.sub}}>Suggested speed</span><br/><b>{avgSpeedKph.toFixed(1)} km/h</b></div>
        <div><span style={{color:COLORS.sub}}>ETA</span><br/><b>{Math.round(etaMin)} min</b></div>
      </div>
    </div>
  )
}
