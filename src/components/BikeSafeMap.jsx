import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import QRCode from 'qrcode'
import ShareButtons from './ShareButtons.jsx'
import GeoAutocomplete from './GeoAutocomplete.jsx'
import RouteInsights from './RouteInsights.jsx'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const ORS_KEY      = import.meta.env.VITE_ORS_KEY
const ORS_BASE     = import.meta.env.DEV ? '/ors' : 'https://api.openrouteservice.org'

const DEFAULT_CENTER = [-79.6440, 43.5890]
const DEFAULT_ZOOM   = 12

const ROUGH_SURFACES = new Set([2,8,10,11,12,15,17,18])
const STEEP_MED_PCT  = 5
const STEEP_HIGH_PCT = 8

const WAYTYPE_LABELS = {
  0:'Other / unknown', 
  1:'High-speed highway', 
  2:'Primary road', 
  3:'Secondary / local road',
  4:'Multi-use path', 
  5:'Unpaved / rough track', 
  6:'Dedicated bike lane/track',
  7:'Footway / sidewalk', 
  8:'Stairs', 
  9:'Ferry', 
  10:'Construction area'
}
const wayLabel = (c) => WAYTYPE_LABELS[Number(c)] ?? 'Other / unknown'

const http = async (url, opts = {}, timeout = 20000) => {
  const ctl = new AbortController()
  const id = setTimeout(()=>ctl.abort(), timeout)
  try { return await fetch(url, { ...opts, signal: ctl.signal }) }
  finally { clearTimeout(id) }
}

// Prefer user's location for initial map center; fall back to Mississauga if unavailable/denied.
async function getInitialCenter(){
  if (!('geolocation' in navigator)) return DEFAULT_CENTER
  try{
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy:false, timeout:7000, maximumAge:300000 }
      )
    })
    const { longitude: lng, latitude: lat } = pos.coords || {}
    return (Number.isFinite(lng) && Number.isFinite(lat)) ? [lng, lat] : DEFAULT_CENTER
  }catch{
    return DEFAULT_CENTER
  }
}

export default function BikeSafeMap(){
  const mapRef = useRef(null)
  const panelRef = useRef(null)
  const qrRef = useRef(null)
  const popupRef = useRef(null)

  const hoveredRidRef = useRef(-1)
  const routeCoordsRef = useRef([])
  const distKmRef = useRef([])
  const lastRouteRef = useRef(null)

  const originMarkerRef = useRef(null)
  const destMarkerRef = useRef(null)

  const [map, setMap] = useState(null)
  const [originText, setOriginText] = useState('')
  const [destText, setDestText] = useState('')
  const [originCoord, setOriginCoord] = useState(null)
  const [destCoord, setDestCoord] = useState(null)
  const [activePicker, setActivePicker] = useState(null)

  const [shareUrl, setShareUrl] = useState('')
  const [insights, setInsights] = useState(null)
  const [riskMix, setRiskMix] = useState(null)
  const [riskBands, setRiskBands] = useState([])
  const [directions, setDirections] = useState([])

  const [routing, setRouting] = useState(false)
  const [err, setErr] = useState(null)

  const [showCyclePaths, setShowCyclePaths] = useState(false)
  const CYCLE_LAYER_ID = 'cycle-paths-overlay'
  const CYCLE_CASING_ID = 'cycle-paths-overlay-casing'

  const [biasProximity, setBiasProximity] = useState([DEFAULT_CENTER[0], DEFAULT_CENTER[1]])
  const [biasBBox, setBiasBBox] = useState(null)
  const [acResetKey, setAcResetKey] = useState(0)

  const [routes, setRoutes] = useState([])   // exactly 3 designated routes
  const [activeRouteIdx, setActiveRouteIdx] = useState(0)
  const activeRoute = routes[activeRouteIdx] || null

  // --- risk overlay housekeeping
  const safeRemoveLayer  = (m, id) => { try { if (m.getLayer(id))  m.removeLayer(id) } catch {} }
  const safeRemoveSource = (m, id) => { try { if (m.getSource(id)) m.removeSource(id) } catch {} }
  const clearRiskOverlay = (m) => {
    safeRemoveLayer(m, 'route-risk-hover')
    safeRemoveLayer(m, 'route-risk-line')
    safeRemoveSource(m, 'route-risk')
  }

  // map init (geolocate if allowed; else Mississauga)
  useEffect(() => {
    if(!MAPTILER_KEY)
      { setErr('Missing MapTiler key. Set VITE_MAPTILER_KEY.'); return }
    let m
    let cancelled = false;

    (async () => {
      const center = await getInitialCenter()
      if (cancelled) return
      try{
        m = new maplibregl.Map({
          container: mapRef.current,
          style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
          center,
          zoom: DEFAULT_ZOOM
        })
        m.addControl(new maplibregl.NavigationControl({ showCompass:false }))
        m.once('load', () => {
          setMap(m)
          popupRef.current = new maplibregl.Popup({ closeButton:false, closeOnClick:false, offset:8, maxWidth:'280px' })
          ensureParksOverlay(m)
        })
        m.on('error', (e) => setErr(e?.error?.message || 'Map error — check MapTiler key.'))
      }catch{ setErr('Failed to init map. Check keys/network.') }
    })()
    return () => { cancelled = true; try{ m && m.remove() }catch{} }
  }, [])

  // bias search to viewport
  useEffect(() => {
    if (!map) return
    const update = () => {
      const c = map.getCenter(), b = map.getBounds()
      setBiasProximity([+c.lng.toFixed(5), +c.lat.toFixed(5)])
      setBiasBBox([+b.getWest().toFixed(5), +b.getSouth().toFixed(5), +b.getEast().toFixed(5), +b.getNorth().toFixed(5)])
    }
    update()
    map.on('moveend', update)
    return () => map.off('moveend', update)
  }, [map])

  // resize
  useEffect(() => {
    if(!map) return
    const onResize = () => map.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [map])

  // click-to-pick pins
  useEffect(() => {
    if(!map) return
    map.getCanvas().style.cursor = activePicker ? 'crosshair' : ''
    const onClick = (e) => {
      if (!activePicker) return
      const c = { lng: e.lngLat.lng, lat: e.lngLat.lat }

      if (activePicker === 'origin') {
        setOriginCoord(c)
        setOriginText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)
        addOrMoveMarker('origin', c)
        const d = destMarkerRef.current?.getLngLat?.()
        if (d) route({ origin: c, dest: { lng: d.lng, lat: d.lat } })
      } else {
        setDestCoord(c)
        setDestText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)
        addOrMoveMarker('dest', c)
        const o = originMarkerRef.current?.getLngLat?.()
        if (o) route({ origin: { lng: o.lng, lat: o.lat }, dest: c })
      }
      setActivePicker(null)
    }
    const onEsc = (ev) => { if(ev.key === 'Escape') setActivePicker(null) }
    map.on('click', onClick)
    window.addEventListener('keydown', onEsc)
    return () => { map.off('click', onClick); window.removeEventListener('keydown', onEsc); map.getCanvas().style.cursor = '' }
  }, [map, activePicker])

  // drag-drop onto map
  useEffect(() => {
    if (!map || !mapRef.current) return
    const el = mapRef.current
    const onDragOver = (e) => { if (e.dataTransfer?.types?.includes('text/pin') || e.dataTransfer?.types?.includes('text/plain')) e.preventDefault() }
    const onDrop = (e) => {
      e.preventDefault()
      const which = (e.dataTransfer.getData('text/pin') || e.dataTransfer.getData('text/plain') || '').toLowerCase()
      const kind = (which === 'origin' || which === 'start' || which === 'from') ? 'origin' : 'dest'
      const rect = el.getBoundingClientRect()
      const pt = [e.clientX - rect.left, e.clientY - rect.top]
      placeByDrop(kind, map.unproject(pt))
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => { el.removeEventListener('dragover', onDragOver); el.removeEventListener('drop', onDrop) }
  }, [map, originCoord, destCoord])

  // --- Draw designated routes, rebuild risk overlay when selection changes
  useEffect(() => {
    if (!map || !routes?.length || !map.isStyleLoaded?.()) return

    try {
      // draw 3 designated routes; dim those not active
      routes.forEach((feat, idx) => {
        const src = `route-${idx}`
        const id  = `route-line-${idx}`
        const isActive = idx === activeRouteIdx

        if (!map.getSource(src)) map.addSource(src, { type: 'geojson', data: feat })
        else map.getSource(src).setData(feat)

        if (!map.getLayer(id)) {
          map.addLayer({
            id,
            type: 'line',
            source: src,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-width': isActive ? 8 : 5,          // thicker
              'line-color': isActive ? '#60a5fa' : '#9ca3af',
              'line-opacity': isActive ? 1.0 : 0.35
            }
          })
          map.on('click', id, () => setActiveRouteIdx(idx))
        } else {
          map.setPaintProperty(id, 'line-width',  isActive ? 8 : 5)
          map.setPaintProperty(id, 'line-color',  isActive ? '#60a5fa' : '#9ca3af')
          map.setPaintProperty(id, 'line-opacity',isActive ? 1.0 : 0.35)
        }
      })

      // rebuild risk overlay for the ACTIVE route
      const active = routes[activeRouteIdx]
      clearRiskOverlay(map)

      const riskFC = toRiskFC(active)
      if (riskFC?.features?.length) {
        map.addSource('route-risk', { type:'geojson', data:riskFC })

        map.addLayer({
          id:'route-risk-line', type:'line', source:'route-risk',
          layout:{ 'line-cap':'round','line-join':'round' },
          paint:{
            'line-width':10,  // thicker risk
            'line-color':['match',['get','risk'],
              'high','#ef4444','med','#f59e0b','low','#10b981','#10b981']
          }
        })

        map.addLayer({
          id:'route-risk-hover', type:'line', source:'route-risk',
          paint:{ 'line-width':14, 'line-color':'#ffffff', 'line-opacity':0.25 },
          filter:['==',['get','rid'],-1]
        })
        hoveredRidRef.current = -1
      }

      // update insights + directions + cursor + panel metrics
      if (active) {
        lastRouteRef.current = active
        routeCoordsRef.current = active.geometry?.coordinates || []

        const i = getInsights(active)
        setInsights(i)
        distKmRef.current = i?.distKm || []
        setDirections(flatSteps(active))

        // compute risk mix + bands against current distKm
        if (riskFC?.features?.length) {
          const kmByRisk = { low:0, med:0, high:0 }
          for (const f of riskFC.features) {
            const c = f.geometry?.coordinates || []
            let len = 0
            for (let k=1;k<c.length;k++){
              const [x1,y1] = c[k-1], [x2,y2] = c[k]
              len += haversineMeters({lng:x1,lat:y1},{lng:x2,lat:y2})
            }
            const r = f.properties?.risk
            if (kmByRisk[r] != null) kmByRisk[r] += (len/1000)
          }
          const totalKm = kmByRisk.low + kmByRisk.med + kmByRisk.high || 1
          setRiskMix({
            ...kmByRisk, totalKm,
            pctLow:Math.round((kmByRisk.low/totalKm)*100),
            pctMed:Math.round((kmByRisk.med/totalKm)*100),
            pctHigh:Math.round((kmByRisk.high/totalKm)*100),
          })

          const bands = []
          const distKm = distKmRef.current
          for (const f of riskFC.features){
            const s = f.properties?.sIndex ?? 0
            const e = f.properties?.eIndex ?? s
            const fromKm = distKm[Math.max(0, Math.min(distKm.length-1, s))] ?? 0
            const toKm   = distKm[Math.max(0, Math.min(distKm.length-1, e))] ?? fromKm
            const risk   = f.properties?.risk || 'low'
            const way    = f.properties?.way
            const reasons = String(f.properties?.why || '')
              .split(' • ').map(s => s.trim()).filter(Boolean)
            bands.push({ fromKm, toKm, risk, wayLabel: wayLabel(way), reasons })
          }
          setRiskBands(bands)
        }

        fitRoute(active, { tightness: 1.6 })
        ensureRouteCursor()
        if (routeCoordsRef.current.length) {
          const [lng, lat] = routeCoordsRef.current[0]
          updateRouteCursor(lng, lat)
        }
      }
    } catch (err) {
      console.error('Map route draw error:', err)
    }
  }, [map, routes, activeRouteIdx])

  // hover popup for risk segments
  useEffect(() => {
    if(!map) return
    const onMove = (e) => {
      if (!map.getLayer('route-risk-line')) { map.getCanvas().style.cursor=''; popupRef.current?.remove(); return }
      let feats = []
      try { feats = map.queryRenderedFeatures(e.point, { layers: ['route-risk-line'] }) } catch { return }
      if (!feats.length){ map.getCanvas().style.cursor=''; popupRef.current?.remove(); if (map.getLayer('route-risk-hover')) map.setFilter('route-risk-hover', ['==',['get','rid'],-1]); hoveredRidRef.current=-1; return }

      map.getCanvas().style.cursor='pointer'
      const f = feats[0]
      const { risk='low', why='', rid=-1, way } = f.properties || {}

      if (map.getLayer('route-risk-hover') && Number(rid) !== hoveredRidRef.current) {
        map.setFilter('route-risk-hover', ['==', ['get','rid'], Number(rid)])
        hoveredRidRef.current = Number(rid)
      }

      const color = risk==='high' ? '#991b1b' : risk==='med' ? '#92400e' : '#065f46'
      const lines = [`Road: ${wayLabel(way)}`, ...(String(why).split(' • ').filter(Boolean))]

      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font:12px system-ui; line-height:1.4; max-width:260px; color:#0b1220;">
            <div style="font-weight:700; margin-bottom:6px; text-transform:uppercase; letter-spacing:.02em; color:${color}">
              ${String(risk).toUpperCase()} RISK
            </div>
            ${lines.map(s=>`<div style="margin:2px 0;">• <span style="color:#111827">${s}</span></div>`).join('')}
          </div>
        `)
        .addTo(map)
    }
    map.on('mousemove', onMove)
    return () => { map.off('mousemove', onMove); popupRef.current?.remove() }
  }, [map])

  // geolocation
  const useMyLocation = (which) => {
    if (!navigator.geolocation) { setErr('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lng: pos.coords.longitude, lat: pos.coords.latitude }
        if(which === 'origin'){
          setOriginCoord(c); setOriginText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`); addOrMoveMarker('origin', c)
        }else{
          setDestCoord(c); setDestText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`); addOrMoveMarker('dest', c)
        }
        map?.easeTo({ center:[c.lng,c.lat], zoom:13 })
      },
      (e) => setErr(e?.message || 'Location error'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  function resolveTransportSource(m){
    const layers = m.getStyle()?.layers || []
    for (const L of layers){
      if (L['source-layer'] === 'transportation' && m.getSource(L.source)) {
        return { source: L.source, sourceLayer: 'transportation' }
      }
    }
    for (const name of ['openmaptiles','composite','basemap','maptiler']){
      if (m.getSource(name)) return { source: name, sourceLayer: 'transportation' }
    }
    return null
  }

  function firstBeforeId(m){
    for (const id of ['route-risk-hover','route-risk-line','route-line']) {
      if (m.getLayer(id)) return id
    }
    const layers = m.getStyle()?.layers || []
    const label = [...layers].reverse().find(L => (L.type === 'symbol'))
    return label?.id || undefined
  }

  function addCyclePathsLayer(){
    const m = map
    if (!m || m.getLayer(CYCLE_LAYER_ID)) return

    const found = resolveTransportSource(m)
    if (!found){
      console.warn('[cycle-overlay] transport source not ready; will retry on next styledata')
      return
    }

    const before = firstBeforeId(m)

    const baseFilter = [
      'any',
      ['==', ['get','class'], 'cycleway'],
      ['==', ['get','subclass'], 'cycleway'],
      ['all',
        ['==', ['get','class'], 'path'],
        ['in', ['coalesce', ['get','bicycle'], 'no'], ['literal', ['designated','yes']]]
      ]
    ]

    m.addLayer({
      id: CYCLE_CASING_ID,
      type: 'line',
      source: found.source,
      'source-layer': found.sourceLayer,
      filter: baseFilter,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4, 16, 6],
        'line-opacity': 0.35
      }
    }, before)

    m.addLayer({
      id: CYCLE_LAYER_ID,
      type: 'line',
      source: found.source,
      'source-layer': found.sourceLayer,
      filter: baseFilter,
      paint: {
        'line-color': '#22c55e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 14, 3, 16, 5],
        'line-opacity': 0.9
      }
    }, before)
  }

  function removeCyclePathsLayer(){
    if (!map) return
    try { if (map.getLayer(CYCLE_LAYER_ID))  map.removeLayer(CYCLE_LAYER_ID) } catch {}
    try { if (map.getLayer(CYCLE_CASING_ID)) map.removeLayer(CYCLE_CASING_ID) } catch {}
  }

  // toggle overlay
  useEffect(() => {
    if (!map) return
    showCyclePaths ? addCyclePathsLayer() : removeCyclePathsLayer()
  }, [map, showCyclePaths])

  // re-add overlay if style reloads
  useEffect(() => {
    if (!map) return
    const tryAdd = () => { if (showCyclePaths && !map.getLayer(CYCLE_LAYER_ID)) addCyclePathsLayer() }
    map.on('styledata', tryAdd)
    return () => map.off('styledata', tryAdd)
  }, [map, showCyclePaths])

  // pins
  const makePinEl = (hex) => {
    const el = document.createElement('div')
    el.style.width='26px'; el.style.height='32px'; el.style.pointerEvents='auto'; el.style.background='transparent'
    el.innerHTML = `<svg viewBox="0 0 24 32" width="26" height="32" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C7.03 1 3 5.03 3 10c0 6.6 9 20 9 20s9-13.4 9-20C21 5.03 16.97 1 12 1z" fill="${hex}"/><circle cx="12" cy="10" r="3.2" fill="#fff" fill-opacity="0.35"/></svg>`
    return el
  }
  const recolorMarker = (ref, hex) => {
    const el = ref?.current?.getElement?.()
    const path = el?.querySelector('path')
    if (path && path.getAttribute('fill') !== hex) path.setAttribute('fill', hex)
  }
  const addOrMoveMarker = (id, c) => {
    if (!map) return
    const ref = id === 'origin' ? originMarkerRef : destMarkerRef
    const color = id === 'origin' ? '#22c55e' : '#ef4444'
    if (ref.current){ ref.current.setLngLat([c.lng, c.lat]); recolorMarker(ref, color); return }
    const marker = new maplibregl.Marker({ element: makePinEl(color), draggable:true, anchor:'bottom' })
      .setLngLat([c.lng,c.lat]).addTo(map)
    const wrap = marker.getElement(); Object.assign(wrap.style, { background:'transparent', border:0, boxShadow:'none', padding:0, borderRadius:0 })
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat()
      const p = { lng, lat }
      if (id === 'origin') {
        setOriginCoord(p)
        setOriginText(`${lat.toFixed(5)},${lng.toFixed(5)}`)
        const d = destMarkerRef.current?.getLngLat?.()
        if (d) route({ origin: p, dest: { lng: d.lng, lat: d.lat } })
      } else {
        setDestCoord(p)
        setDestText(`${lat.toFixed(5)},${lng.toFixed(5)}`)
        const o = originMarkerRef.current?.getLngLat?.()
        if (o) route({ origin: { lng: o.lng, lat: o.lat }, dest: p })
      }
    })
    if (id === 'origin') originMarkerRef.current = marker
    else destMarkerRef.current = marker
  }
  const setPinDragImage = (ev, color) => {
    const ghost = makePinEl(color)
    ghost.style.position='fixed'; ghost.style.left='-9999px'; ghost.style.top='-9999px'
    document.body.appendChild(ghost)
    ev.dataTransfer.setDragImage(ghost, 13, 30)
    setTimeout(()=>document.body.removeChild(ghost),0)
  }
  const onDragStartPin = (ev, which) => {
    const kind = String(which).toLowerCase()==='origin' ? 'origin' : 'dest'
    ev.dataTransfer.setData('text/pin', kind)
    ev.dataTransfer.setData('text/plain', kind)
    ev.dataTransfer.effectAllowed = 'copyMove'
    setPinDragImage(ev, kind==='origin' ? '#22c55e' : '#ef4444')
  }
  const placeByDrop = (which, lngLat) => {
    const c = { lng: lngLat.lng, lat: lngLat.lat }
    if (which === 'origin') {
      setOriginCoord(c)
      setOriginText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)
      addOrMoveMarker('origin', c)
      const d = destMarkerRef.current?.getLngLat?.()
      if (d) route({ origin: c, dest: { lng: d.lng, lat: d.lat } })
    } else {
      setDestCoord(c)
      setDestText(`${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)
      addOrMoveMarker('dest', c)
      const o = originMarkerRef.current?.getLngLat?.()
      if (o) route({ origin: { lng: o.lng, lat: o.lat }, dest: c })
    }
  }

  // geocode or lat,lng
  const parseLatLng = (t) => {
    const m = String(t||'').trim().match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/)
    if (!m) return null
    const lat = +m[1], lng = +m[2]
    if (!Number.isFinite(lat)||!Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { lat, lng }
  }
  const geocode = async (q) => {
    const ll = parseLatLng(q); if (ll) return { lng: ll.lng, lat: ll.lat }
    if (!MAPTILER_KEY) throw new Error('To search by address, set VITE_MAPTILER_KEY')
    const params = new URLSearchParams({ key: MAPTILER_KEY, limit: '1' })
    if (biasProximity?.length===2) params.set('proximity', `${biasProximity[0]},${biasProximity[1]}`)
    if (biasBBox?.length===4) params.set('bbox', biasBBox.join(','))
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(String(q))}.json?${params}`
    const res = await http(url, { headers:{ accept:'application/json' } }, 12000)
    if (!res.ok) throw new Error(`Place search failed (${res.status})`)
    const data = await res.json()
    const feat = data?.features?.[0]; if (!feat?.center) throw new Error('Place not found')
    const [lng, lat] = feat.center; return { lng, lat }
  }

  // --- risk + insights (kept as before)
  const haversineMeters = (a,b) => {
    const R=6371000, toRad = x=>x*Math.PI/180
    const dLat = toRad(b.lat-a.lat), dLon = toRad(b.lng-a.lng)
    const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2
    return 2*R*Math.asin(Math.sqrt(s))
  }
  const avgGrade = (seg) => {
    let dSum=0, dzSum=0
    for (let i=1;i<seg.length;i++){
      const [x1,y1,z1=0] = seg[i-1], [x2,y2,z2=0] = seg[i]
      const d = haversineMeters({lng:x1,lat:y1},{lng:x2,lat:y2})
      if (d>0){ dSum+=d; dzSum+=Math.abs(z2-z1) }
    }
    return dSum ? (dzSum/dSum)*100 : 0
  }
  const valueAt = (i, ranges, fallback=null) => { for (const [a,b,v] of ranges || []) if (i>=a && i<=b) return v; return fallback }
  const gradeRisk = ({ suit, surf, avgPct }) => {
    const reasons = []
    const s = suit > 1 ? suit : suit * 10
    if (s <= 4) reasons.push(`Lower suitability score (${s.toFixed(1)}/10)`)
    else if (s <= 7) reasons.push(`Moderate suitability (${s.toFixed(1)}/10)`)
    if (avgPct >= STEEP_HIGH_PCT) reasons.push(`Steep grade (~${avgPct.toFixed(1)}%)`)
    else if (avgPct >= STEEP_MED_PCT) reasons.push(`Noticeable grade (~${avgPct.toFixed(1)}%)`)
    const rough = ROUGH_SURFACES.has(surf); if (rough) reasons.push('Unpaved / rough surface')
    const risk = (s <= 4) ? 'high' : ((s <= 7 || avgPct >= STEEP_HIGH_PCT || rough) ? 'med' : 'low')
    return { risk, reasons }
  }
  const toRiskFC = (feature) => {
    const coords = feature?.geometry?.coordinates || []
    const extras = feature?.properties?.extras || {}
    if (coords.length < 2) return null
    const suitVals = extras.suitability?.values || []
    const wayVals  = extras.waytype?.values || []
    const surfVals = extras.surface?.values || []
    const cuts = new Set([0, coords.length-1])
    ;[suitVals, wayVals, surfVals].forEach(arr => { for (const [a,b] of arr || []) { cuts.add(a); cuts.add(b) } })
    const idx = Array.from(cuts).sort((a,b)=>a-b)

    const fc = { type:'FeatureCollection', features:[] }
    let rid=0
    for (let i=0;i<idx.length-1;i++){
      const s = idx[i], e = Math.max(s+1, idx[i+1])
      const m = Math.floor((s+e)/2)
      const suit = valueAt(m, suitVals, 7)
      const way  = valueAt(m, wayVals, null)
      const surf = valueAt(m, surfVals, null)
      const seg = coords.slice(s, e+1)
      const avgPct = avgGrade(seg)
      const { risk, reasons } = gradeRisk({ suit, surf, avgPct })
      fc.features.push({
        type:'Feature',
        properties:{ rid, risk, suit, way, sIndex:s, eIndex:e, gradePct:+avgPct.toFixed(1), why:reasons.join(' • ') },
        geometry:{ type:'LineString', coordinates: seg }
      })
      rid++
    }
    return fc
  }
  const getInsights = (feature) => {
    const coords = feature.geometry?.coordinates || []
    if (coords.length < 2) return null
    let total=0, ascent=0, descent=0
    const distKm=[0], elevM=[coords[0][2]??0], samples=[]
    for (let i=1;i<coords.length;i++){
      const [x1,y1,z1=0]=coords[i-1], [x2,y2,z2=0]=coords[i]
      const d = haversineMeters({lng:x1,lat:y1},{lng:x2,lat:y2})
      total += d; const dz = z2 - z1; if (dz>0) ascent+=dz; else descent+=-dz
      distKm.push(total/1000); elevM.push(z2)
      if (d>0){ const grade = dz/d; let v = 18 - 80*grade; v = Math.max(10, Math.min(v,28)); samples.push({ v, w:d }) }
    }
    const sumW = samples.reduce((s,x)=>s+x.w,0) || 1
    const avgV = samples.reduce((s,x)=>s + x.v*(x.w/sumW), 0)
    const etaMin = (total/1000) / Math.max(5, avgV) * 60
    return { distKm, elevM, totalDistM:total, ascentM:ascent, descentM:descent, avgSpeedKph:avgV, etaMin }
  }

  // --- route picking helpers (distance/risk + 3 designated routes) ---
  const distanceOf = (feature) =>
    (feature?.properties?.summary?.distance) ??
    (getInsights(feature)?.totalDistM ?? 0)

  const riskScore = (feature) => {
    const fc = toRiskFC(feature)
    if (!fc?.features?.length) return 1e9
    let lenM = 0, score = 0
    for (const f of fc.features) {
      const c = f.geometry?.coordinates || []
      let seg = 0
      for (let i=1;i<c.length;i++){
        const [x1,y1] = c[i-1], [x2,y2] = c[i]
        seg += haversineMeters({lng:x1,lat:y1},{lng:x2,lat:y2})
      }
      lenM += seg
      const w = f.properties?.risk === 'high' ? 3 : (f.properties?.risk === 'med' ? 2 : 1)
      score += w * seg
    }
    const km = Math.max(0.001, lenM/1000)
    return score / km // avg weighted risk per km (lower is safer)
  }

  // Strong geometry signature (for distinctness)
const routeSig = (feature, samples = 12) => {
  const c = feature?.geometry?.coordinates || []
  if (!c.length) return 'empty'
  const n = c.length, picks = []
  for (let i = 0; i < samples; i++) {
    const j = Math.floor(i * (n - 1) / (samples - 1))
    const [x, y] = c[j] || []
    picks.push(+x?.toFixed?.(5), +y?.toFixed?.(5))
  }
  const dist = Math.round(distanceOf(feature) || 0)
  return JSON.stringify([picks, dist])
}
const isSameRoute = (a, b) => routeSig(a) === routeSig(b)

const byDistinctness = (arr) => {
  const seen = new Set(), out = []
  for (const f of arr || []) {
    const sig = routeSig(f)
    if (!seen.has(sig)) { seen.add(sig); out.push(f) }
  }
  return out
}

// Clone before labeling so labels don’t bleed between identical objects
const cloneAndLabel = (f, _label, _tag) => {
  const c = JSON.parse(JSON.stringify(f))     // deep clone
  c.properties = { ...(c.properties || {}), _label, _tag }
  return c
}


  // --- Robust ORS request with fallbacks for common 400s
  const orsPost = async (body) => {
    const apiKey = ORS_KEY || import.meta.env.VITE_ORS_KEY
    if (!apiKey) throw new Error('Missing OpenRouteService key (VITE_ORS_KEY)')
    const baseURL = `${ORS_BASE}/v2/directions/cycling-regular/geojson`
    const headers = {
      'Authorization': apiKey,
      'content-type':'application/json',
      'accept':'application/geo+json, application/json;q=0.9, */*;q=0.8'
    }

    const doFetch = async (b) => {
      const res = await http(baseURL, { method:'POST', headers, body: JSON.stringify(b) }, 20000)
      const text = await res.text()
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      const json = ct.includes('json') ? JSON.parse(text) : null
      return { res, text, json }
    }

    let cur = body
    for (let attempt = 0; attempt < 3; attempt++){
      const { res, text, json } = await doFetch(cur)
      if (res.ok) return json
      const msg = (json?.error?.message || json?.message || text || '').toString()

      // fallback order:
      if (res.status === 400 && /extra_info|suitability/i.test(msg) && Array.isArray(cur.extra_info) && cur.extra_info.includes('suitability')) {
        cur = { ...cur, extra_info: cur.extra_info.filter(x => x !== 'suitability') }
        continue
      }
      if (res.status === 400 && /profile_params|weightings|options/i.test(msg) && cur?.options?.profile_params) {
        const options = { ...(cur.options || {}) }; delete options.profile_params
        cur = { ...cur, options }
        continue
      }
      if (res.status === 400 && /alternative_routes/i.test(msg) && cur?.options?.alternative_routes) {
        const options = { ...(cur.options || {}) }; delete options.alternative_routes
        cur = { ...cur, options }
        continue
      }
      throw new Error(`ORS error ${res.status}: ${msg || 'bad request'}`)
    }
    throw new Error('ORS failed after retries')
  }

  // Returns up to N alternatives from ORS for a preference
  async function fetchORSWithAlts(o, d, preference='recommended', altCount=3, weightFactor=1.6) {
    const body = {
      coordinates: [[o.lng,o.lat],[d.lng,d.lat]],
      preference,
      elevation: true,
      instructions: true,
      instructions_format: 'text',
      extra_info: ['steepness','surface','waytype','suitability'],
      options: {
        profile_params: { weightings: { steepness_difficulty: 1 } },
        alternative_routes: altCount > 1 ? {
          target_count: altCount,
          share_factor: 0.6,
          weight_factor: weightFactor
        } : undefined
      }
    }
    const json = await orsPost(body)
    const feats = (json?.features || []).map(f => {
      f.properties = { ...(f.properties||{}), _preference: preference }
      return f
    })
    return feats
  }


async function fetchThreeRoutes(o, d) {
  // 1) Shortest (take the absolute shortest from a small pool)
  const shortestPool = await fetchORSWithAlts(o, d, 'shortest', 3, 2.0).catch(() => [])
  if (!shortestPool.length) throw new Error('No route (shortest)')
  const shortest = [...shortestPool].sort((a,b)=>distanceOf(a)-distanceOf(b))[0]
  const shortestDist = distanceOf(shortest)

  // 2) Build a large, diverse candidate pool
  const pools = await Promise.all([
    fetchORSWithAlts(o, d, 'recommended', 8, 2.4).catch(() => []),
    fetchORSWithAlts(o, d, 'recommended', 8, 3.0).catch(() => []),
    fetchORSWithAlts(o, d, 'fastest',     6, 2.2).catch(() => []),
  ])
  let candidates = byDistinctness([ ...pools.flat(), ...shortestPool ])
  // don't compare against itself in later picks
  candidates = candidates.filter(f => !isSameRoute(f, shortest))

  // 3) Safest overall (distinct from shortest)
  let safest = [...candidates].sort((a,b)=>riskScore(a)-riskScore(b))
                .find(f => !isSameRoute(f, shortest)) || shortest

  // 4) Long & Scenic (pick longest distinct; if not clearly longer, still take a distinct alt)
  const minLong = shortestDist * 1.25; // ≥ +25% vs shortest feels "long"
  let scenic = [...candidates]
    .filter(f => !isSameRoute(f, safest))
    .sort((a,b)=>distanceOf(b)-distanceOf(a))[0]

  if (!scenic || isSameRoute(scenic, shortest) || isSameRoute(scenic, safest)) {
    // fallback: next-best distinct alt, prefer longer; if tie, prefer safer
    scenic = [...candidates]
      .filter(f => !isSameRoute(f, shortest) && !isSameRoute(f, safest))
      .sort((a,b)=>{
        const dl = distanceOf(b) - distanceOf(a)
        if (Math.abs(dl) > 1) return dl
        return riskScore(a) - riskScore(b)
      })[0]
  }

  // 5) Assemble exactly three, cloning to avoid shared mutation
  const out = []
  const pushUnique = (f, label, tag) => {
    if (!f) return
    if (out.some(x => isSameRoute(x, f))) return
    out.push(cloneAndLabel(f, label, tag))
  }

  pushUnique(shortest, 'Shortest', 'shortest')
  pushUnique(safest,   'Safest',   'safest')

  if (scenic && !isSameRoute(scenic, shortest) && !isSameRoute(scenic, safest)) {
    const lbl = distanceOf(scenic) >= minLong ? 'Long & Scenic' : 'Alternate'
    pushUnique(scenic, lbl, 'long')
  }

  // Backfill if ORS still gave only two distinct options
  for (const c of candidates) {
    if (out.length >= 3) break
    pushUnique(c, 'Alternate', 'alt')
  }
  // Absolute last resort: clone shortest so UI always shows three
  if (out.length < 3) pushUnique(shortest, 'Alternate', 'alt')

  return out.slice(0, 3)
}



  // routing (uses designated routes)
  const route = async (overrides = {}) => {
    if(!map) return
    setErr(null); setInsights(null); setRiskMix(null); setRiskBands([]); setDirections([]); setRouting(true)
    setActivePicker(null)
    try{
      const o = overrides.origin || originCoord || (originText ? await geocode(originText) : null)
      const d = overrides.dest   || destCoord   || (destText   ? await geocode(destText)   : null)
      if(!o || !d) throw new Error('Enter origin and destination')
      if (haversineMeters(o, d) < 8) throw new Error('Start and destination are the same point')

      setOriginCoord(o); setDestCoord(d)
      addOrMoveMarker('origin', o); addOrMoveMarker('dest', d)

      const features = await fetchThreeRoutes(o, d)
      if (!Array.isArray(features) || !features.length) throw new Error('No route found')

      setRoutes(features)           // three designated
      setActiveRouteIdx(0)          // select "Shortest" by default

      lastRouteRef.current = features[0]
      routeCoordsRef.current = features[0].geometry?.coordinates || []

      const url = new URL('https://www.google.com/maps/dir/')
      url.searchParams.set('api','1')
      url.searchParams.set('origin', `${o.lat},${o.lng}`)
      url.searchParams.set('destination', `${d.lat},${d.lng}`)
      url.searchParams.set('travelmode','bicycling')
      const s = url.toString()
      setShareUrl(s)
      if(qrRef.current) await QRCode.toCanvas(qrRef.current, s, { width: 192 })

      setAcResetKey(k => k + 1)
    }catch(e){
      setErr(e?.message || 'Routing failed')
    }finally{ setRouting(false) }
  }

  // camera + cursor + steps
  const pad = () => ({ top:40, right:40, bottom:40, left:(panelRef.current?.offsetWidth ?? 0) + 24 })
  const boundsFor = (feature) => {
    const g = feature?.geometry; if (!g) return null
    const b = new maplibregl.LngLatBounds()
    const add = (pt) => { const [lng,lat] = pt; if (Number.isFinite(lng)&&Number.isFinite(lat)) b.extend([lng,lat]) }
    const addLine = (line) => line.forEach(add)
    if (g.type === 'LineString') addLine(g.coordinates)
    else if (g.type === 'MultiLineString') g.coordinates.forEach(addLine)
    else if (g.type === 'GeometryCollection')
      g.geometries.forEach(gg => (gg.type === 'LineString') ? addLine(gg.coordinates) :
                                gg.type === 'MultiLineString' && gg.coordinates.forEach(addLine))
    return b.isEmpty() ? null : b
  }
  const fitRoute = (feature, { panelAware=true, tightness=1.0, zoomOffset=0 } = {}) => {
    const b = boundsFor(feature); if (!b) return
    const base = panelAware ? pad() : { top:40,right:40,bottom:40,left:40 }
    const p = { top: base.top/tightness, right: base.right/tightness, bottom: base.bottom/tightness, left: base.left/tightness }
    const cam = typeof map?.cameraForBounds === 'function'
      ? map.cameraForBounds(b, { padding:p, maxZoom:18 })
      : { center:b.getCenter(), zoom:14 }
    if (zoomOffset) cam.zoom = Math.min(20, cam.zoom + zoomOffset)
    map.easeTo({ ...cam, bearing:0, pitch:0, duration:700 })
  }
  const defaultRouteView = () => { if (lastRouteRef.current) fitRoute(lastRouteRef.current, { panelAware:false, tightness:1.6 }) }
  const zoomBy = (d) => map && map.easeTo({ zoom: Math.max(1, Math.min(20, map.getZoom()+d)), duration:200 })

  const ensureRouteCursor = () => {
    if (!map || map.getSource('route-cursor')) return
    map.addSource('route-cursor', { type:'geojson', data:{ type:'FeatureCollection', features:[] } })
    map.addLayer({
      id:'route-cursor-layer', type:'circle', source:'route-cursor',
      paint:{ 'circle-radius':6, 'circle-color':'#ffffff', 'circle-stroke-width':3, 'circle-stroke-color':'#2563eb' }
    })
  }
  const updateRouteCursor = (lng, lat) => {
    if (!map || !map.getSource('route-cursor')) return
    map.getSource('route-cursor').setData({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[lng,lat] } }] })
  }
  const focusAtKm = (km, { panOnly=false } = {}) => {
    const coords = routeCoordsRef.current, distKm = distKmRef.current
    if (!map || !coords?.length || !distKm?.length) return
    let lo=0, hi=distKm.length-1
    while (lo<hi){ const mid=(lo+hi)>>1; (distKm[mid]<km) ? (lo=mid+1) : (hi=mid) }
    const i = Math.max(0, Math.min(distKm.length-1, lo))
    const [lng,lat] = coords[i] || []
    if (!Number.isFinite(lng)||!Number.isFinite(lat)) return
    updateRouteCursor(lng, lat)
    map.easeTo({ center:[lng,lat], zoom:Math.max(map.getZoom(),14), duration: panOnly?150:300 })
  }
  const flatSteps = (feature) => {
    const segs = feature?.properties?.segments || []; const out=[]
    segs.forEach((seg, si) => (seg.steps||[]).forEach((s, idx) => out.push({ ...s, segIndex:si, stepIndex:idx })))
    return out
  }
  const focusStep = (st) => {
    try{
      const wp = Array.isArray(st?.way_points) ? st.way_points : [0,0]
      const mid = Math.round(((wp[0]??0)+(wp[1]??0))/2)
      const coords = routeCoordsRef.current
      if (!map || !coords?.length) return
      const i = Math.max(0, Math.min(coords.length-1, mid))
      const [lng,lat] = coords[i] || []
      ensureRouteCursor(); updateRouteCursor(lng, lat)
      map.easeTo({ center:[lng,lat], zoom:Math.max(map.getZoom(),15), duration:350 })
    }catch{}
  }

  const fmtDist = (m) => (m < 950 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`)
  const putGeoJSON = (sourceId, data, layer) => {
    if(!map) return
    if(map.getSource(sourceId)) map.getSource(sourceId).setData(data)
    else map.addSource(sourceId, { type:'geojson', data })
    const id = layer.id
    if(!map.getLayer(id)) map.addLayer(layer)
    else{
      if (layer.paint)  for (const k in layer.paint)  map.setPaintProperty(id, k, layer.paint[k])
      if (layer.layout) for (const k in layer.layout) map.setLayoutProperty(id, k, layer.layout[k])
    }
  }

  const selectRoute = (idx, feature) => {
    setActiveRouteIdx(idx)
    lastRouteRef.current = feature
    routeCoordsRef.current = feature.geometry?.coordinates || []
    const ins = getInsights(feature)
    setInsights(ins)
    fitRoute(feature, { tightness: 1.6 })
  }

  // ui
  const dragPinStyle = { display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, marginLeft:8, borderRadius:8, cursor:'grab', border:'1px solid #2a3b5f', background:'#0e172a', fontSize:18, userSelect:'none' }

  return (
    <div className="map-wrap">
      <div className="controls" ref={panelRef}>
        {err && <div role="alert" aria-live="assertive" style={{background:'#3b1f1f',color:'#ffd9d9',padding:8,borderRadius:8,marginBottom:8}}>{err}</div>}

        <label>
          Start
          <div className="row">
            <GeoAutocomplete
              key={`origin-${acResetKey}`}
              value={originText}
              onChange={setOriginText}
              onSelect={({center,label})=>{
                const c={lng:center[0],lat:center[1]}
                setOriginCoord(c); setOriginText(label); addOrMoveMarker('origin', c)
                try{ document.activeElement?.blur?.() }catch{}
              }}
              placeholder="Enter origin"
              onFocus={()=>{ setActivePicker('origin'); setInsights(null) }}
              biasProximity={biasProximity}
              biasBBox={biasBBox}
            />
            <div draggable onDragStart={(e)=>onDragStartPin(e,'origin')} title="Drag this pin onto the map to set Start" aria-grabbed="false" style={{...dragPinStyle, color:'#22c55e'}}>📍</div>
            <button type="button" onClick={()=>useMyLocation('origin')}>Use my location</button>
          </div>
        </label>

        <label>
          Destination
          <div className="row">
            <GeoAutocomplete
              key={`dest-${acResetKey}`}
              value={destText}
              onChange={setDestText}
              onSelect={({center,label})=>{
                const c={lng:center[0],lat:center[1]}
                setDestCoord(c); setDestText(label); addOrMoveMarker('dest', c)
                try{ document.activeElement?.blur?.() }catch{}
              }}
              placeholder="Enter destination"
              onFocus={()=>{ setActivePicker('destination'); setInsights(null) }}
              biasProximity={biasProximity}
              biasBBox={biasBBox}
            />
            <div draggable onDragStart={(e)=>onDragStartPin(e,'dest')} title="Drag this pin onto the map to set Destination" aria-grabbed="false" style={{...dragPinStyle, color:'#ef4444'}}>📍</div>
            <button type="button" onClick={()=>useMyLocation('destination')}>Use my location</button>
          </div>
        </label>

        {activePicker && (
          <div style={{margin:'8px 0', fontSize:12, color:'#9fb1c7'}}>
            Click on the map to set <b>{activePicker === 'origin' ? 'Start' : 'Destination'}</b> • Press <kbd>Esc</kbd> to cancel
          </div>
        )}

        <button className="primary" type="button" onClick={route} disabled={routing} aria-busy={routing} aria-live="polite">
          {routing ? 'Routing…' : 'Find Bike-Safe Route'}
        </button>
        
        {!!routes.length && (
          <div style={{marginTop:12}}>
            <h3 style={{margin:'8px 0', color:'#cfe1ff', fontSize:14}}>Designated Routes</h3>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {routes.map((r, i) => {
                const label = r.properties?._label || r.properties?._preference || `Route ${i+1}`
                const stats = getInsights(r)
                const isActive = i === activeRouteIdx
                return (
                  <button
                    key={i}
                    onClick={() => { setActiveRouteIdx(i); selectRoute(i, r) }}
                    style={{
                      textAlign:'left',
                      padding:'8px 10px',
                      borderRadius:6,
                      cursor:'pointer',
                      border:`1px solid ${isActive ? '#60a5fa' : '#2a3b5f'}`,
                      background:isActive ? '#1e293b' : '#0e172a',
                      color:'#cfe1ff'
                    }}
                  >
                    <div style={{fontWeight:600}}>{label}</div>
                    {stats && (
                      <div style={{fontSize:12, opacity:0.8}}>
                        { (stats.totalDistM/1000).toFixed(1) } km • ↑{Math.round(stats.ascentM)}m • ETA {Math.round(stats.etaMin)} min
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          <button type="button" className="secondary" onClick={defaultRouteView} title="Frame current route, centered">Default route view</button>
          <button type="button" className="secondary" onClick={() => zoomBy(+1)} title="Zoom in">Zoom +</button>
          <button type="button" className="secondary" onClick={() => zoomBy(-1)} title="Zoom out">Zoom −</button>
        </div>

        <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
          <label style={{ display:'inline-flex', gap:8, alignItems:'center', fontSize:14 }}>
            <input type="checkbox" checked={showCyclePaths} onChange={e => setShowCyclePaths(e.target.checked)} aria-label="Toggle cycle paths overlay" />
            Show cycle paths overlay
          </label>
        </div>

        <RouteInsights
          i={insights}
          bands={riskBands}
          onScrub={(km)=>focusAtKm(km, { panOnly:true })}
          onSelect={(km)=>focusAtKm(km)}
        />

        <div style={{marginTop:8, fontSize:12, color:'#9fb1c7'}}>
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <span><b>Risk legend:</b></span>
            <span><i style={{display:'inline-block',width:10,height:10,background:'#10b981',borderRadius:3,marginRight:6}}/>low</span>
            <span><i style={{display:'inline-block',width:10,height:10,background:'#f59e0b',borderRadius:3,marginRight:6}}/>med</span>
            <span><i style={{display:'inline-block',width:10,height:10,background:'#ef4444',borderRadius:3,marginRight:6}}/>high</span>
          </div>
        </div>

        {!!directions.length && (
          <div className="directions-card" style={{marginTop:12, padding:12, borderRadius:8, background:'#0b1220', color:'#e6efff', border:'1px solid #1f2a40'}}>
            <h3 style={{margin:'0 0 6px'}}>Directions</h3>
            <ol style={{margin:0, paddingLeft:18, maxHeight:220, overflow:'auto', fontSize:14}}>
              {directions.map((st) => (
                <li key={`${st.segIndex}-${st.stepIndex}`} style={{margin:'4px 0', lineHeight:1.35}}>
                  <button
                    type="button"
                    onClick={()=>focusStep(st)}
                    style={{marginRight:8, padding:'2px 6px', fontSize:12, cursor:'pointer', borderRadius:6, border:'1px solid #2a3b5f', background:'#0e172a', color:'#cfe1ff'}}
                    title="Focus this step on the map"
                    aria-label={`Focus step ${st.segIndex + 1}-${st.stepIndex + 1}`}
                  >
                    Focus
                  </button>
                  <span>{st.instruction}</span>
                  <span style={{opacity:.7}}> — {fmtDist(st.distance)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {shareUrl && (
          <div className="share" style={{marginTop:12}}>
            <h3>Share to your phone</h3>
            <ShareButtons url={shareUrl} />
            <canvas ref={qrRef} aria-label="QR code for opening this route on your phone" />
            <p><a href={shareUrl} target="_blank" rel="noreferrer">Open route in Google Maps</a></p>
          </div>
        )}
      </div>

      <div ref={mapRef} className="map" style={{minHeight:'60vh'}} />
    </div>
  )
}

// --- parks overlay (simple)
const anyVectorSource = (m) => {
  const srcs = m.getStyle()?.sources || {}
  return Object.keys(srcs).find(k => srcs[k].type === 'vector')
}
const ensureParksOverlay = (m) => {
  const style = m.getStyle() || {}
  const layers = style.layers || []
  const land = layers.find(L => L.type==='fill' && L['source-layer']==='landuse')
  const src = land?.source || anyVectorSource(m); if (!src) return
  const layer = land?.['source-layer'] || 'landuse'
  const parkFilter = ['any',['match',['get','class'],['park','recreation_ground','garden','nature_reserve','protected_area'],true,false],['==',['get','subclass'],'park']]
  if (!m.hasImage('park-icon')) m.addImage('park-icon', makeParkIcon(), { pixelRatio:2 })
  if (!m.getLayer('parks-fill')) m.addLayer({ id:'parks-fill', type:'fill', source:src, 'source-layer':layer, filter:parkFilter, paint:{ 'fill-color':'#22c55e','fill-opacity':0.45 } })
  if (!m.getLayer('parks-outline')) m.addLayer({ id:'parks-outline', type:'line', source:src, 'source-layer':layer, filter:parkFilter, paint:{ 'line-color':'#16a34a','line-width':2,'line-dasharray':[2,2],'line-opacity':0.9 } })
  if (!m.getLayer('parks-icon')) m.addLayer({
    id:'parks-icon', type:'symbol', source:src, 'source-layer':layer, filter:parkFilter, minzoom:10,
    layout:{ 'icon-image':'park-icon','icon-size':['interpolate',['linear'],['zoom'],10,0.9,12,1.0,15,1.2],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-placement':'point','icon-offset':[0,-2] }
  })
}
const makeParkIcon = () => {
  const px=64, c=document.createElement('canvas'); c.width=c.height=px
  const ctx=c.getContext('2d'); ctx.fillStyle='#16a34a'
  ctx.beginPath(); ctx.arc(px/2,px/2,22,0,Math.PI*2); ctx.fill()
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(px/2,px/2-14); ctx.lineTo(px/2-13,px/2+4); ctx.lineTo(px/2+13,px/2+4); ctx.closePath(); ctx.fill()
  ctx.fillRect(px/2-3,px/2+4,6,12); return c
}
