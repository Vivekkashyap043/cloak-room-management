import React, { useState, useRef, useEffect } from 'react'
import './ExitForm.css'
import Spinner from './icons/Spinner'

export default function ExitForm({ token, eventName }) {
  // Use relative paths so dev proxy or same-origin works
  const [tokenNumber, setTokenNumber] = useState('')
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'success' | 'error' | ''
  // scanner removed — QR scanning not used in exit form
  const [imageModal, setImageModal] = useState({ src: null, alt: '' })
  const imageModalCloseRef = useRef(null)

  // toasts removed — use inline messages via setMessage

  async function findByToken(e) {
    e && e.preventDefault()
    setMessage('')
    setMessageType('')
    try {
  const qs = eventName ? `?event=${encodeURIComponent(eventName)}` : ''
  const res = await fetch(`/api/records/token/${encodeURIComponent(tokenNumber)}${qs}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      let data
      try {
        data = await res.json()
      } catch (parseErr) {
        if (!res.ok) {
          setMessage(res.statusText || 'Not found')
          setMessageType('error')
          return
        }
        setMessage('Unexpected response from server')
        setMessageType('error')
        return
      }
      if (!res.ok) {
        setMessage(data.message || 'Not found')
        setMessageType('error')
        return
      }
      // Show record if found. If status is 'returned' we still display the record
      // but show an informational/error message and disable the Return button.
      if (data) {
        setResult([data])
        if (String(data.status).toLowerCase() === 'deposited') {
          setMessage('')
          setMessageType('')
        } else if (String(data.status).toLowerCase() === 'returned') {
          setMessage(`Item is already returned`)
          setMessageType('error')
        } else {
          setMessage(data.message || `Record status: ${data.status || 'unknown'}`)
          setMessageType('error')
        }
      }
    } catch (err) {
      setMessage('Server error')
      setMessageType('error')
    }
  }

  // find by name removed (person_name no longer stored)

  async function exitRecord(r) {
    setMessage('')
    setMessageType('')
    try {
  // Prevent attempting to return an item that's already returned
  if (r && String(r.status).toLowerCase() !== 'deposited') {
    setMessage(`Item is already returned`)
    setMessageType('error')
    return
  }
  const res = await fetch(`/api/records/exit/${encodeURIComponent(r.token_number)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ event_name: eventName })
      })
      const data = await res.json()
  if (!res.ok) return setMessage(data.message || 'Failed')
  setMessage(`Item returned with token number ${r.token_number}`)
  setMessageType('success')
  // remove the returned record from the displayed results (we only show deposited records)
      setResult(prev => prev ? prev.filter(x => x.token_number !== r.token_number) : [])
    } catch (err) {
      setMessage('Server error')
      setMessageType('error')
    }
  }

  const tokenRef = useRef(null)
  useEffect(() => {
    if (tokenRef.current) tokenRef.current.focus()
  }, [])

  // handle closing image modal with ESC and prevent background scroll
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setImageModal({ src: null, alt: '' })
    }
    if (imageModal && imageModal.src) {
      document.addEventListener('keydown', onKey)
      // prevent background scroll
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      // focus close button when modal opens
      try { setTimeout(() => imageModalCloseRef.current && imageModalCloseRef.current.focus(), 50) } catch (e) {}
      return () => {
        document.removeEventListener('keydown', onKey)
        document.body.style.overflow = prev
      }
    }
  }, [imageModal])

  function handleQrDetected(result) {
    if (!result) return
    setTokenNumber(String(result).trim())
  }

  return (
  <div className="entry-form-inner">
    {/* helpful banner when not served over HTTPS */}
    {typeof window !== 'undefined' && !window.isSecureContext && (
      <div style={{ background: '#fff4e5', border: '1px solid #ffd9b3', padding: 10, marginBottom: 12, borderRadius: 6 }} role="alert">
        Scanner and camera features require a secure origin (HTTPS). If you're opening the app via http://LAN-IP the browser may block camera access — use HTTPS or a tunnel (ngrok/localtunnel) for remote devices.
      </div>
    )}
  {/* QR scanner removed */}
  <div className="exit-search-grid">
    <form onSubmit={findByToken} className="entry-vertical-form exit-inline-form">
      <div className="form-group" style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
          <input id="exit-token" ref={tokenRef} className="large-input" placeholder="Enter token number" value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} style={{ flex: 1 }} />
          <button className="primary big" type="submit" aria-label="Find by token" disabled={!tokenNumber.trim()}>GET</button>
        </div>
      </div>
    </form>
  </div>

  {message && <div className={`message ${messageType}`}>{message}</div>}

      {result && result.length > 0 && (
        <div className="result-card card">
          <h3>Found Item</h3>
          {/* Render a two-column layout: left = token/details/items, right = person photo */}
          {result.map(r => (
            <div key={r.id} className="entry-grid" style={{ alignItems: 'start' }}>
              <div>
                <div className="form-group">
                  <label>Token Number</label>
                  <input className="large-input" value={r.token_number} readOnly />
                </div>

                {r.deposited_at && (
                  <div className="form-group">
                    <label>Deposited At</label>
                    <input className="large-input" value={new Date(r.deposited_at).toLocaleString()} readOnly />
                  </div>
                )}

                <div className="form-group">
                  <label>Items</label>
                  <div>
                    {Array.isArray(r.items) && r.items.length > 0 ? (
                      r.items.map(it => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {it.item_photo_path ? <img onClick={() => setImageModal({ src: it.item_photo_path, alt: it.item_name })} src={it.item_photo_path} alt={it.item_name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }} /> : <div style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', background: '#f3f4f6', borderRadius: 6 }}>📦</div>}
                            <div>{it.item_name}</div>
                          </div>
                          <div>× {it.item_count}</div>
                        </div>
                      ))
                    ) : (
                      <div className="muted">No items recorded</div> 
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  {String(r.status).toLowerCase() === 'deposited' ? (
                    <button className="primary big" onClick={() => exitRecord(r)}>{'Return Item'}</button>
                  ) : (
                    <button className="primary big" disabled>{'Returned'}</button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', gap: 12}}>
                  <div className="photo-box">
                    <div className="photo-label">Person Photo</div>
                    {r.person_photo_path ? <img onClick={() => setImageModal({ src: r.person_photo_path, alt: 'Person Photo' })} src={r.person_photo_path} alt="person" className="thumb" onLoad={e=>e.currentTarget.classList.add('loaded')} style={{ cursor: 'pointer' }} /> : <div className="photo-placeholder">No photo</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {imageModal && imageModal.src && (
        <div className="image-modal-overlay" onClick={() => setImageModal({ src: null, alt: '' })}>
          <div className="image-modal" role="dialog" aria-modal="true" aria-label={imageModal.alt || 'Image preview'} onClick={e => e.stopPropagation()}>
            <button ref={imageModalCloseRef} className="image-modal-close" onClick={() => setImageModal({ src: null, alt: '' })} aria-label="Close">✕</button>
            <img src={imageModal.src} alt={imageModal.alt || 'Image'} />
            <div className="image-modal-caption">{imageModal.alt}</div>
          </div>
        </div>
      )}
    </div>
  )
}
