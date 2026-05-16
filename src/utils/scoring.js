/**
 * scoring.js — Pure scoring & risk utilities for BikeSafe.
 *
 * Extracted from BikeSafeMap.jsx so they can be tested independently
 * and reused without React dependencies.
 */

// ---------------------------------------------------------------------------
// ORS surface-type risk weights (0 = perfect, 1 = worst).
// Covers all 19 ORS Extra-Info "surface" codes.
// ---------------------------------------------------------------------------
export const SURFACE_RISK = {
  0:  0.3,   // unknown
  1:  0.0,   // paved / asphalt
  2:  0.5,   // compacted — rideable but rough, slippery when wet
  3:  0.7,   // unpaved
  4:  0.05,  // concrete
  5:  0.6,   // cobblestone — uncomfortable, slippery when wet
  6:  0.55,  // sett (cut stone) — rough for road bikes
  7:  0.15,  // paving stones — minor bumps
  8:  0.4,   // metal — slippery
  9:  0.6,   // fine gravel — loose
  10: 0.5,   // wood — slippery when wet
  11: 0.7,   // gravel
  12: 0.75,  // ground / dirt
  13: 0.65,  // grass — soft, slow
  14: 0.3,   // reserved
  15: 0.85,  // sand
  16: 0.3,   // reserved
  17: 0.9,   // mud
  18: 1.0,   // ice
}

// Scenic comfort scores per surface (higher = more pleasant ride)
export const SURFACE_SCENIC = {
  0:  0.0,
  1:  +0.5,  // asphalt — smooth
  2:  -0.3,  // compacted
  3:  -0.8,  // unpaved
  4:  +0.4,  // concrete
  5:  -0.5,  // cobblestone
  6:  -0.4,  // sett
  7:  +0.2,  // paving stones
  8:  -0.2,  // metal
  9:  -0.6,  // fine gravel
  10: -0.3,  // wood
  11: -0.8,  // gravel
  12: -1.0,  // ground / dirt
  13: -0.7,  // grass
  14: 0.0,
  15: -1.2,  // sand
  16: 0.0,
  17: -1.4,  // mud
  18: -1.5,  // ice
}

export const isRoughSurface = (id) => (SURFACE_RISK[id] ?? 0.3) >= 0.5

// Grade steepness thresholds (percent slope)
export const STEEP_MED_PCT  = 5
export const STEEP_HIGH_PCT = 8

// ORS way-type labels
export const WAYTYPE_LABELS = {
  0: 'Other / unknown',
  1: 'High-speed highway',
  2: 'Primary road',
  3: 'Secondary / local road',
  4: 'Multi-use path',
  5: 'Unpaved / rough track',
  6: 'Dedicated bike lane/track',
  7: 'Footway / sidewalk',
  8: 'Stairs',
  9: 'Ferry',
  10: 'Construction area',
}
export const wayLabel = (c) => WAYTYPE_LABELS[Number(c)] ?? 'Other / unknown'

// ---------------------------------------------------------------------------
// Infrastructure type inference
// ---------------------------------------------------------------------------

export const INFRA_TYPES = {
  SEPARATED_PATH: 'separated_path',
  BUFFERED_LANE:  'buffered_lane',
  PAINTED_LANE:   'painted_lane',
  SHARED_ROAD:    'shared_road',
  OFF_ROAD:       'off_road',
  RESTRICTED:     'restricted',
}

export const inferInfraType = (way, suit, avgspeed, waycategory) => {
  const w = Number(way)
  const s = suit > 1 ? suit : (suit ?? 0) * 10
  const spd = avgspeed != null ? Number(avgspeed) : null
  const cat = Number(waycategory) || 0

  if (w === 8 || cat & 1 || cat & 2) return INFRA_TYPES.RESTRICTED
  if (w === 4 || w === 7) return INFRA_TYPES.SEPARATED_PATH
  if (w === 6) {
    if (spd == null || spd <= 30) return INFRA_TYPES.SEPARATED_PATH
    if (spd <= 50 && s >= 8) return INFRA_TYPES.BUFFERED_LANE
    if (spd > 50 || s <= 5) return INFRA_TYPES.PAINTED_LANE
    return INFRA_TYPES.BUFFERED_LANE
  }
  if (w === 5) return INFRA_TYPES.OFF_ROAD
  if (w === 1) return INFRA_TYPES.RESTRICTED
  return INFRA_TYPES.SHARED_ROAD
}

export const INFRA_LABEL = {
  separated_path: 'Separated bike path',
  buffered_lane:  'Buffered bike lane',
  painted_lane:   'Painted bike lane',
  shared_road:    'Shared road (no bike infra)',
  off_road:       'Off-road trail',
  restricted:     'Restricted (stairs/highway)',
}

// Per-route-type infrastructure risk (higher = worse)
export const INFRA_RISK = {
  shortest: {
    separated_path: 0.0,
    buffered_lane:  0.0,
    painted_lane:   0.0,
    shared_road:    0.3,
    off_road:       0.6,
    restricted:     2.0,
  },
  safest: {
    separated_path: 0.0,
    buffered_lane:  0.4,
    painted_lane:   1.2,
    shared_road:    1.8,
    off_road:       0.3,
    restricted:     2.5,
  },
  scenic: {
    separated_path: 0.0,
    buffered_lane:  0.3,
    painted_lane:   0.8,
    shared_road:    1.2,
    off_road:       0.2,
    restricted:     2.0,
  },
}

// ---------------------------------------------------------------------------
// Scenic-score bonuses
// ---------------------------------------------------------------------------

// Legacy waytype-based bonuses (used as fallback when infraType is unavailable)
export const SCENIC_WAY_BONUS = {
  4: +3.0,   // multi-use path
  6: +3.5,   // dedicated bike lane/track
  7: +1.0,   // footway / sidewalk (sometimes permitted; small bonus)
  5: -1.5,   // unpaved / track
  3: -0.5,   // secondary / local road
  2: -2.0,   // primary road
  1: -3.0,   // high-speed highway
  8: -4.0,   // stairs
  10: -1.0,  // construction
}

export const SCENIC_INFRA_BONUS = {
  separated_path: +3.5,
  off_road:       +2.5,
  buffered_lane:  +1.0,
  painted_lane:   -1.0,
  shared_road:    -2.0,
  restricted:     -4.0,
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Haversine distance in meters between two {lng, lat} points. */
export const haversineMeters = (a, b) => {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Average absolute grade (%) across a coordinate segment [[lng,lat,elev], …]. */
export const avgGrade = (seg) => {
  let dSum = 0, dzSum = 0
  for (let i = 1; i < seg.length; i++) {
    const [x1, y1, z1 = 0] = seg[i - 1]
    const [x2, y2, z2 = 0] = seg[i]
    const d = haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
    if (d > 0) { dSum += d; dzSum += Math.abs(z2 - z1) }
  }
  return dSum ? (dzSum / dSum) * 100 : 0
}

/** Directional grade — returns { upGrade, downGrade } as percentages. */
export const directionalGrade = (seg) => {
  let dSum = 0, upDz = 0, downDz = 0
  for (let i = 1; i < seg.length; i++) {
    const [x1, y1, z1 = 0] = seg[i - 1]
    const [x2, y2, z2 = 0] = seg[i]
    const d = haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
    if (d > 0) {
      dSum += d
      const dz = z2 - z1
      if (dz > 0) upDz += dz; else downDz += -dz
    }
  }
  return {
    upGrade:   dSum ? (upDz / dSum) * 100 : 0,
    downGrade: dSum ? (downDz / dSum) * 100 : 0,
  }
}

/** Quick total length in meters for a coordinate array. */
export const segLenM = (c) => {
  let len = 0
  for (let i = 1; i < c.length; i++) {
    const [x1, y1] = c[i - 1]
    const [x2, y2] = c[i]
    len += haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
  }
  return len
}

// ---------------------------------------------------------------------------
// Risk grading
// ---------------------------------------------------------------------------

/** Find the value at index `i` in ORS range-encoded extras. */
export const valueAt = (i, ranges, fallback = null) => {
  for (const [a, b, v] of ranges || []) if (i >= a && i <= b) return v
  return fallback
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Continuous risk value for a single segment (0 = safe, 3 = worst).
 * Combines suitability, steepness (directional), surface, and traffic speed.
 * segLen dampens steepness penalty for short segments (<200m).
 */
export const continuousRiskValue = ({ suit, surf, avgPct, avgspeed, upGrade, downGrade, segLen }) => {
  const s = suit > 1 ? suit : (suit ?? 7) * 10
  const suitRisk = 3.0 * Math.pow(1 - clamp(s, 1, 10) / 10, 1.5)

  const upRisk   = clamp((upGrade ?? avgPct) / 15, 0, 1) * 1.5
  const downRisk = clamp((downGrade ?? 0) / 10, 0, 1) * 2.5
  const lenDampen = segLen != null ? clamp(segLen / 200, 0.3, 1.0) : 1.0
  const steepRisk = Math.max(upRisk, downRisk) * lenDampen

  const surfRisk  = (SURFACE_RISK[surf] ?? 0.3) * 2.0
  const spd = avgspeed != null ? Number(avgspeed) : null
  const speedRisk = spd != null ? clamp((spd - 40) / 50, 0, 1) * 2.0 : 0

  return clamp(suitRisk * 0.35 + steepRisk * 0.25 + surfRisk * 0.2 + speedRisk * 0.2, 0, 3)
}

/**
 * Grade a single route segment as low / med / high risk.
 *
 * Returns { risk, reasons, value } where value is the continuous
 * float in [0, 3] and risk is the display band string.
 */
export const gradeRisk = ({ suit, surf, avgPct, avgspeed, infraType, upGrade, downGrade, segLen }) => {
  const reasons = []
  const s = suit > 1 ? suit : (suit ?? 7) * 10
  if (s <= 4) reasons.push(`Lower suitability score (${s.toFixed(1)}/10)`)
  else if (s <= 7) reasons.push(`Moderate suitability (${s.toFixed(1)}/10)`)

  const dg = downGrade ?? 0
  const ug = upGrade ?? avgPct
  if (dg >= STEEP_HIGH_PCT) reasons.push(`Steep descent (~${dg.toFixed(1)}%)`)
  else if (ug >= STEEP_HIGH_PCT) reasons.push(`Steep climb (~${ug.toFixed(1)}%)`)
  else if (dg >= STEEP_MED_PCT) reasons.push(`Noticeable descent (~${dg.toFixed(1)}%)`)
  else if (ug >= STEEP_MED_PCT) reasons.push(`Noticeable climb (~${ug.toFixed(1)}%)`)

  const surfW = SURFACE_RISK[surf] ?? 0.3
  if (surfW >= 0.7) reasons.push('Unpaved / rough surface')
  else if (surfW >= 0.5) reasons.push('Rough surface')

  const spd = avgspeed != null ? Number(avgspeed) : null
  if (spd != null && spd >= 60) reasons.push(`High-speed road (~${Math.round(spd)} km/h)`)

  if (infraType === 'painted_lane' && spd != null && spd > 50)
    reasons.push('Painted bike lane on fast road')
  else if (infraType === 'shared_road')
    reasons.push('No cycling infrastructure')

  const value = continuousRiskValue({ suit, surf, avgPct, avgspeed, upGrade, downGrade, segLen })
  const risk = value >= 2.0 ? 'high' : value >= 1.0 ? 'med' : 'low'
  return { risk, reasons, value }
}

// ---------------------------------------------------------------------------
// Risk feature-collection builder
// ---------------------------------------------------------------------------

/** Build a GeoJSON FeatureCollection of risk-graded segments from an ORS route feature. */
export const toRiskFCRaw = (feature) => {
  const coords = feature?.geometry?.coordinates || []
  const extras = feature?.properties?.extras || {}
  if (coords.length < 2) return null

  const suitVals  = extras.suitability?.values || []
  const wayVals   = extras.waytype?.values || []
  const surfVals  = extras.surface?.values || []
  const speedVals = extras.avgspeed?.values || []
  const catVals   = extras.waycategory?.values || []

  const cuts = new Set([0, coords.length - 1])
  ;[suitVals, wayVals, surfVals, speedVals, catVals].forEach((arr) => {
    for (const [a, b] of arr || []) { cuts.add(a); cuts.add(b) }
  })
  const idx = Array.from(cuts).sort((a, b) => a - b)

  const fc = { type: 'FeatureCollection', features: [] }
  let rid = 0
  for (let i = 0; i < idx.length - 1; i++) {
    const s = idx[i]
    const e = Math.max(s + 1, idx[i + 1])
    const m = Math.floor((s + e) / 2)
    const suit     = valueAt(m, suitVals, 7)
    const way      = valueAt(m, wayVals, null)
    const surf     = valueAt(m, surfVals, null)
    const avgspeed = valueAt(m, speedVals, null)
    const waycat   = valueAt(m, catVals, 0)
    const seg      = coords.slice(s, e + 1)
    const sLen     = segLenM(seg)
    const avgPct   = avgGrade(seg)
    const { upGrade, downGrade } = directionalGrade(seg)
    const infraType = inferInfraType(way, suit, avgspeed, waycat)
    const { risk, reasons, value } = gradeRisk({ suit, surf, avgPct, avgspeed, infraType, upGrade, downGrade, segLen: sLen })
    fc.features.push({
      type: 'Feature',
      properties: {
        rid, risk, value, suit, way, surf, avgspeed, waycategory: waycat, infraType,
        sIndex: s, eIndex: e,
        gradePct: +avgPct.toFixed(1),
        why: reasons.join(' • '),
      },
      geometry: { type: 'LineString', coordinates: seg },
    })
    rid++
  }
  return fc
}

// ---------------------------------------------------------------------------
// Route-level scores
// ---------------------------------------------------------------------------

/** Total distance (meters) of a route feature. */
export const distanceOf = (feature) =>
  feature?.properties?.summary?.distance ??
  (getInsights(feature)?.totalDistM ?? 0)

/**
 * Weighted risk score per km (lower = safer).
 *
 * When routeType is provided, uses infrastructure-aware scoring:
 * each segment's infra risk (from INFRA_RISK table) plus the base
 * risk band weight, combined per-km.
 *
 * When routeType is omitted, falls back to the original 3/2/1 band weights.
 * Returns 2.0 (neutral) when extra_info is unavailable.
 */
export const riskScore = (feature, toRiskFC, routeType) => {
  const fc = toRiskFC(feature)
  if (!fc?.features?.length) return 2.0
  const infraTable = routeType ? INFRA_RISK[routeType] : null
  let lenM = 0, score = 0
  for (const f of fc.features) {
    const c = f.geometry?.coordinates || []
    let seg = 0
    for (let i = 1; i < c.length; i++) {
      const [x1, y1] = c[i - 1]
      const [x2, y2] = c[i]
      seg += haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
    }
    lenM += seg

    let w
    if (infraTable && f.properties?.infraType) {
      const bandW = f.properties.risk === 'high' ? 3 : f.properties.risk === 'med' ? 2 : 1
      const infraW = infraTable[f.properties.infraType] ?? 0
      w = bandW * 0.4 + infraW * 0.6
    } else {
      w = f.properties?.risk === 'high' ? 3 : f.properties?.risk === 'med' ? 2 : 1
    }
    score += w * seg
  }
  const km = Math.max(0.001, lenM / 1000)
  return score / km
}

// ---------------------------------------------------------------------------
// Route insights (elevation, distance, speed, ETA)
// ---------------------------------------------------------------------------

/** Compute elevation profile, cumulative distance, suggested speed & ETA. */
export const getInsights = (feature) => {
  const coords = feature?.geometry?.coordinates || []
  if (coords.length < 2) return null

  let total = 0, ascent = 0, descent = 0
  const distKm = [0]
  const elevM = [coords[0][2] ?? 0]
  const samples = []

  for (let i = 1; i < coords.length; i++) {
    const [x1, y1, z1 = 0] = coords[i - 1]
    const [x2, y2, z2 = 0] = coords[i]
    const d = haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
    total += d
    const dz = z2 - z1
    if (dz > 0) ascent += dz; else descent += -dz
    distKm.push(total / 1000)
    elevM.push(z2)
    if (d > 0) {
      const grade = dz / d
      let v = 18 - 80 * grade
      v = Math.max(10, Math.min(v, 28))
      samples.push({ v, w: d })
    }
  }

  const sumW = samples.reduce((s, x) => s + x.w, 0) || 1
  const avgV = samples.reduce((s, x) => s + x.v * (x.w / sumW), 0)
  const etaMin = ((total / 1000) / Math.max(5, avgV)) * 60

  return { distKm, elevM, totalDistM: total, ascentM: ascent, descentM: descent, avgSpeedKph: avgV, etaMin }
}

// ---------------------------------------------------------------------------
// Route deduplication
// ---------------------------------------------------------------------------

/**
 * Geometry signature for route distinctness checks.
 * Samples 20 evenly-spaced points plus total distance.
 * (Increased from 12 to reduce false-positive dedup on short routes.)
 */
export const routeSig = (feature, samples = 20) => {
  const c = feature?.geometry?.coordinates || []
  if (!c.length) return 'empty'
  const n = c.length
  const picks = []
  for (let i = 0; i < samples; i++) {
    const j = Math.floor(i * (n - 1) / (samples - 1))
    const [x, y] = c[j] || []
    picks.push(+x?.toFixed?.(5), +y?.toFixed?.(5))
  }
  const dist = Math.round(distanceOf(feature) || 0)
  return JSON.stringify([picks, dist])
}

export const isSameRoute = (a, b) => routeSig(a) === routeSig(b)

export const byDistinctness = (arr) => {
  const seen = new Set()
  const out = []
  for (const f of arr || []) {
    const sig = routeSig(f)
    if (!seen.has(sig)) { seen.add(sig); out.push(f) }
  }
  return out
}

/** Deep-clone a feature and attach label metadata. */
export const cloneAndLabel = (f, _label, _tag) => {
  const c = JSON.parse(JSON.stringify(f))
  c.properties = { ...(c.properties || {}), _label, _tag }
  return c
}

/**
 * Geometric overlap fraction between two routes (0 = disjoint, 1 = identical).
 * Samples both routes every ~100m and counts how many samples from A
 * are within 50m of any sample from B.
 */
export const routeOverlap = (a, b) => {
  const sample = (feature, stepM = 100) => {
    const coords = feature?.geometry?.coordinates || []
    if (coords.length < 2) return []
    const pts = [coords[0]]
    let acc = 0
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1] = coords[i - 1], [x2, y2] = coords[i]
      acc += haversineMeters({ lng: x1, lat: y1 }, { lng: x2, lat: y2 })
      if (acc >= stepM) { pts.push(coords[i]); acc = 0 }
    }
    return pts
  }
  const ptsA = sample(a), ptsB = sample(b)
  if (!ptsA.length || !ptsB.length) return 0
  let near = 0
  for (const [ax, ay] of ptsA) {
    for (const [bx, by] of ptsB) {
      if (haversineMeters({ lng: ax, lat: ay }, { lng: bx, lat: by }) < 50) { near++; break }
    }
  }
  return near / ptsA.length
}

// ---------------------------------------------------------------------------
// Scenic scoring
// ---------------------------------------------------------------------------

/**
 * Scenic score per km (higher = better).
 * Combines waytype bonus, surface quality, and an optional environment bonus
 * function (parks/water proximity) that the caller supplies.
 *
 * @param {object}   feature   - ORS route GeoJSON feature
 * @param {Function} toRiskFC  - cached toRiskFCRaw wrapper
 * @param {Function} [envBonusFn] - (coords) => number  (0–5 range).
 *        Called with the segment's coordinate array; returns a bonus for
 *        nearby parks / water. Optional — defaults to 0 when omitted.
 */
export const scenicScore = (feature, toRiskFC, envBonusFn) => {
  const fc = toRiskFC(feature)
  if (!fc?.features?.length) return null

  let totalM = 0, score = 0
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates || []
    const L = segLenM(coords)
    if (L <= 0) continue
    totalM += L

    const infra = f.properties?.infraType
    const way   = Number(f.properties?.way ?? -1)
    const surf  = f.properties?.surf ?? f.properties?.surface

    const bInfra = infra ? (SCENIC_INFRA_BONUS[infra] ?? 0) : (SCENIC_WAY_BONUS[way] ?? 0)
    const bSurf  = SURFACE_SCENIC[Number(surf)] ?? 0
    const bEnv   = typeof envBonusFn === 'function' ? envBonusFn(coords) : 0

    const segScore = (bInfra + bSurf + bEnv * 0.25) * (L / 1000)
    score += segScore
  }

  const km = Math.max(0.001, totalM / 1000)
  return score / km
}
