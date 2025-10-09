import React from 'react'

export default function ShareButtons({ url }){
  // SMS intent (works on mobile; desktop behavior depends on OS defaults)
  const smsHref = `sms:?&body=${encodeURIComponent(url)}`
  // Email fallback
  const mailHref = `mailto:?subject=Bike%20route&body=${encodeURIComponent(url)}`

  return (
    <div className="share-buttons">
      <a className="btn" href={smsHref}>Send via SMS</a>
      <a className="btn" href={mailHref}>Send via Email</a>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
    </div>
  )
}