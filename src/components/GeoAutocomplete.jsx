import React, { useEffect, useRef, useState } from 'react'
const API_KEY = import.meta.env.VITE_MAPTILER_KEY

export default function GeoAutocomplete({ value, onChange, onSelect, placeholder, onFocus }){
  const [items, setItems] = useState([])
  const [open, setOpen]   = useState(false)
  const t = useRef()
  

  useEffect(() => {
    if(!value){ setItems([]); return }
    clearTimeout(t.current)
    t.current = setTimeout(async () => {
      if(!API_KEY) return
      try{
        const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(value)}.json?key=${API_KEY}&limit=5`
        const r = await fetch(url)
        const j = await r.json()
        setItems(j.features || [])
        setOpen(true)
      }catch{ setItems([]) }
    }, 250)
    return () => clearTimeout(t.current)
  }, [value])

  function pick(f){
    const label = f.place_name || f.properties?.label || f.text || value
    onChange(label)
    onSelect({ center: f.center, label })
    setOpen(false)
  }

  return (
    <div className="ac-wrap">
      <input
        value={value}
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => { onFocus?.(); if(value && items.length) setOpen(true) }}
        onBlur={() => setTimeout(()=>setOpen(false), 120)}
      />
      {open && items.length>0 && (
        <ul className="ac-list">
          {items.map((f,i)=> (
            <li key={i} onMouseDown={()=>pick(f)}>
              {f.place_name || f.properties?.label || f.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
