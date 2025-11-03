import React, { useState, useRef, useEffect } from 'react'
import './ExitForm.css'
import Spinner from './icons/Spinner'

export default function ExitForm({ token }) {
  // Use relative paths so dev proxy or same-origin works
  const [tokenNumber, setTokenNumber] = useState('')
  const [searchName, setSearchName] = useState('')
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')

  // toasts removed — use inline messages via setMessage

  async function findByToken(e) {
    e && e.preventDefault()
    setMessage('')
    try {
  const res = await fetch(`/api/records/token/${encodeURIComponent(tokenNumber)}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      let data
      try {
        data = await res.json()
      } catch (parseErr) {
        if (!res.ok) return setMessage(res.statusText || 'Not found')
        return setMessage('Unexpected response from server')
      }
      if (!res.ok) return setMessage(data.message || 'Not found')
      // only show records that are still submitted (active)
      if (data && String(data.status).toLowerCase() === 'submitted') setResult([data])
      else setMessage('No submitted record found for that token')
    } catch (err) {
      setMessage('Server error')
    }
  }

  async function findByName(e) {
    e && e.preventDefault()
    setMessage('')
    try {
      if (!searchName.trim()) return setMessage('Enter a name to search')
  const res = await fetch(`/api/records/person/${encodeURIComponent(searchName)}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      let data
      try {
        data = await res.json()
      } catch (parseErr) {
        if (!res.ok) return setMessage(res.statusText || 'Not found')
        return setMessage('Unexpected response from server')
      }
        if (!res.ok) return setMessage(data.message || 'Not found')
        // debug: log server response for troubleshooting
        console.debug('findByName response', { status: res.status, body: data })
        if (!Array.isArray(data)) return setResult([])
        const submitted = data.filter(r => String(r.status).toLowerCase() === 'submitted')
        if (submitted.length === 0) return setMessage(`No submitted records found (server returned ${data.length} rows)`) 
        setResult(submitted)
    } catch (err) {
      setMessage('Server error')
    }
  }

  async function exitRecord(r) {
    setMessage('')
    try {
  const res = await fetch(`/api/records/exit/${encodeURIComponent(r.token_number)}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      })
      const data = await res.json()
  if (!res.ok) return setMessage(data.message || 'Failed')
      setMessage('Returned: ' + r.token_number)
      // remove the returned record from the displayed results (we only show Submitted records)
      setResult(prev => prev ? prev.filter(x => x.token_number !== r.token_number) : [])
    } catch (err) {
      setMessage('Server error')
    }
  }

  const tokenRef = useRef(null)
  useEffect(() => {
    if (tokenRef.current) tokenRef.current.focus()
  }, [])

  return (
  <div className="entry-form-inner">
  <div className="exit-search-grid">
  <form onSubmit={findByToken} className="entry-vertical-form">
        <div className="form-group">
          <label htmlFor="exit-token">Find by Token</label>
          <input id="exit-token" ref={tokenRef} className="large-input" placeholder="Enter token number" value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="primary big" type="submit" aria-label="Find by token" disabled={!tokenNumber.trim()}>Find by Token</button>
        </div>
  </form>

  <form onSubmit={findByName} className="entry-vertical-form">
        <div className="form-group">
          <label htmlFor="exit-name">Find by Person</label>
          <input id="exit-name" className="large-input" placeholder="Search by person name" value={searchName} onChange={e => setSearchName(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="primary big" type="submit" aria-label="Find by name" disabled={!searchName.trim()}>Find by Name</button>
        </div>
  </form>
  </div>

      {message && <div className="message">{message}</div>}

      {result && result.length > 0 && (
        <div className="result-card card">
          <h3>Found Item</h3>
          {/* Render a two-column form similar to Entry */}
          {result.map(r => (
            <div key={r.id} className="entry-grid" style={{ alignItems: 'start' }}>
              <div>
                <div className="form-group">
                  <label>Token Number</label>
                  <input className="large-input" value={r.token_number} readOnly />
                </div>
                <div className="form-group">
                  <label>Person Name</label>
                  <input className="large-input" value={r.person_name} readOnly />
                </div>
                <div className="form-group">
                  <label>Things Name</label>
                  <input className="large-input" value={r.things_name} readOnly />
                </div>

                {r.submitted_at && (
                  <div className="form-group">
                    <label>Submitted At</label>
                    <input className="large-input" value={new Date(r.submitted_at).toLocaleString()} readOnly />
                  </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button className="primary big" onClick={() => exitRecord(r)}>{'Return Item'}</button>
                </div>

              </div>

              <div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="photo-box">
                    <div className="photo-label">Person's Photo</div>
                    {r.person_photo_path ? <img src={r.person_photo_path} alt="person" className="thumb" onLoad={e=>e.currentTarget.classList.add('loaded')} /> : <div className="photo-placeholder">No photo</div>}
                  </div>

                  <div className="photo-box">
                    <div className="photo-label">Thing's Photo</div>
                    {r.things_photo_path ? <img src={r.things_photo_path} alt="things" className="thumb" onLoad={e=>e.currentTarget.classList.add('loaded')} /> : <div className="photo-placeholder">No photo</div>}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
