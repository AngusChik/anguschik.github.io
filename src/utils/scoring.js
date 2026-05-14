/**
 * scoring.js — Pure scoring & risk utilities for BikeSafe.
 *
 * Extracted from BikeSafeMap.jsx so they can be tested independently
 * and reused without React dependencies.
 */

// ---------------------------------------------------------------------------
// ORS surface-type IDs considered "rough" for risk grading.
//
// These map to ORS Extra-Info "surface" codes:
//   2  = compacted (gravel/earth that's been packed down — still rougher than
//        asphalt for road bikes and can be slippery when wet)
//   8  = metal
//   10 = wood
//   11 = gravel
//   12 = ground / dirt
//   15 = sand
//   17 = mud
//   18 = ice
//
// ID 2 ("compacted") is intentionally included because it is meaningfully
// rougher than paved surfaces for standard road/hybrid cycling tyres.
// ---------------------------------------------------------------------------
export const ROUGH_SURFACES = new Set([2, 8, 10, 11, 12, 15, 17, 18])

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
// Scenic-score waytype bonuses (higher = more scenic / pleasant)
// ---------------------------------------------------------------------------
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

/**
 * Grade a single route segment as low / med / high risk.
 *
 * Suitability normalization: ORS returns suitability on a 1–10 integer scale.
 * Historically some ORS builds used a 0–1 float scale, so we normalise with
 * `suit > 1 ? suit : suit * 10`.  The `> 1` threshold works because ORS
 * never returns fractional values on the 1–10 scale (always integers).
 */
export const gradeRisk = ({ suit, surf, avgPct }) => {
  const reasons = []
  const s = suit > 1 ? suit : suit * 10
  if (s <= 4) reasons.push(`Lower suitability score (${s.toFixed(1)}/10)`)
  else if (s <= 7) reasons.push(`Moderate suitability (${s.toFixed(1)}/10)`)
  if (avgPct >= STEEP_HIGH_PCT) reasons.push(`Steep grade (~${avgPct.toFixed(1)}%)`)
  else if (avgPct >= STEEP_MED_PCT) reasons.push(`Noticeable grade (~${avgPct.toFixed(1)}%)`)
  const rough = ROUGH_SURFACES.has(surf)
  if (rough) reasons.push('Unpaved / rough surface')
  const risk =
    s <= 4 ? 'high' : (s <= 7 || avgPct >= STEEP_HIGH_PCT || rough ? 'med' : 'low')
  return { risk, reasons }
}

// ---------------------------------------------------------------------------
// Risk feature-collection builder
// ---------------------------------------------------------------------------

/** Build a GeoJSON FeatureCollection of risk-graded segments from an ORS route feature. */
export const toRiskFCRaw = (feature) => {
  const coords = feature?.geometry?.coordinates || []
  const extras = feature?.properties?.extras || {}
  if (coords.length < 2) return null

  const suitVals = extras.suitability?.values || []
  const wayVals  = extras.waytype?.values || []
  const surfVals = extras.surface?.values || []

  const cuts = new Set([0, coords.length - 1])
  ;[suitVals, wayVals, surfVals].forEach((arr) => {
    for (const [a, b] of arr || []) { cuts.add(a); cuts.add(b) }
  })
  const idx = Array.from(cuts).sort((a, b) => a - b)

  const fc = { type: 'FeatureCollection', features: [] }
  let rid = 0
  for (let i = 0; i < idx.length - 1; i++) {
    const s = idx[i]
    const e = Math.max(s + 1, idx[i + 1])
    const m = Math.floor((s + e) / 2)
    const suit = valueAt(m, suitVals, 7)
    const way  = valueAt(m, wayVals, null)
    const surf = valueAt(m, surfVals, null)
    const seg  = coords.slice(s, e + 1)
    const avgPct = avgGrade(seg)
    const { risk, reasons } = gradeRisk({ suit, surf, avgPct })
    fc.features.push({
      type: 'Feature',
      properties: {
        rid, risk, suit, way, surf,
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
 * high segments score 3×, med 2×, low 1× — weighted by segment length.
 * Returns 2.0 (neutral / med-equivalent) when extra_info is unavailable.
 */
export const riskScore = (feature, toRiskFC) => {
  const fc = toRiskFC(feature)
  if (!fc?.features?.length) return 2.0
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
    const w = f.properties?.risk === 'high' ? 3 : f.properties?.risk === 'med' ? 2 : 1
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
  if (!fc?.features?.length) return -1e9

  let totalM = 0, score = 0
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates || []
    const L = segLenM(coords)
    if (L <= 0) continue
    totalM += L

    const way  = Number(f.properties?.way ?? -1)
    const surf = f.properties?.surf ?? f.properties?.surface

    const bWay  = SCENIC_WAY_BONUS[way] ?? 0
    const bSurf = ROUGH_SURFACES.has(Number(surf)) ? -1.2 : +0.4
    const bEnv  = typeof envBonusFn === 'function' ? envBonusFn(coords) : 0

    const segScore = (bWay + bSurf + bEnv * 0.25) * (L / 1000)
    score += segScore
  }

  const km = Math.max(0.001, totalM / 1000)
  return score / km
}
