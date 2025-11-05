import React, { useState } from 'react'
import './AdminPanel.css'

export default function AdminPanel({ token }) {
  // Use relative API paths; remove env indirection
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [deleteUsername, setDeleteUsername] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [previewCount, setPreviewCount] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  // event creation fields
  const [evName, setEvName] = useState('')
  const [evDesc, setEvDesc] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evIncharge, setEvIncharge] = useState('')
  const [evInchargePhone, setEvInchargePhone] = useState('')
  const [evLocation, setEvLocation] = useState('')
  
  // toasts removed — use inline messages via setMessage

  async function addUser(e) {
    // can be invoked by button click (no event) or form submit
    if (e && e.preventDefault) e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      if (!username || !password) return setMessage('username and password required')
  const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Failed')
      setMessage('User added')
      setUsername('')
      setPassword('')
    } catch (err) {
      setMessage('Server error')
    } finally {
      setLoading(false)
    }
  }

  async function deleteUser(name) {
  if (!name) return setMessage('Enter a username to delete')
    setMessage('')
    setLoading(true)
    try {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      })
      let data = {}
      try { data = await res.json() } catch (e) { /* ignore non-json */ }
      if (!res.ok) {
        return setMessage(data.message || `Delete failed (${res.status})`)
      }
      // show server-provided message if available
      const msg = data.message || 'User deleted'
      const extra = data.deletedRecords !== undefined ? ` (${data.deletedRecords} returned records removed)` : ''
      setMessage(msg + extra)
      setDeleteUsername('')
      setSearchResult(null)
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function searchUser() {
    if (!deleteUsername) return setMessage('Enter a username to search')
    setLoading(true)
    setSearchResult(null)
    setNotFound(false)
    try {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(deleteUsername)}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (res.status === 404) {
        setNotFound(true)
        setMessage('User not found')
        return
      }
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Search failed')
      setSearchResult(data.user)
      setNotFound(false)
      setMessage('User found')
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function purge() {
    // purge removed from left panel; database purge is handled in the Database Management card
  }

  async function previewDeleteRange() {
    if (!fromDate || !toDate) return setMessage('Please provide from and to dates')
    setLoading(true)
    setMessage('')
    try {
      const qs = `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      const res = await fetch(`/api/admin/records/preview-delete${qs}`, { headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Preview failed')
      setPreviewCount(data.count)
      setPreviewRows(data.rows || [])
      setMessage(`Preview: ${data.count} records will be deleted`)
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function deleteRange() {
    if (!fromDate || !toDate) return setMessage('Please provide from and to dates')
    if (!confirm(`Permanently delete returned records from ${fromDate} to ${toDate}? This will remove DB rows and uploaded photos.`)) return
    setLoading(true)
    setMessage('')
    try {
      const qs = `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      const res = await fetch(`/api/admin/records/delete-range${qs}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
  if (!res.ok) return setMessage(data.message || `Delete failed (${res.status})`)
  // show server-provided message if available
  const msg = data.message || `Deleted ${data.deletedRows || 0} records`
  setMessage(msg)
      setPreviewCount(null)
      setPreviewRows([])
      setFromDate('')
      setToDate('')
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function createEvent(e) {
    if (e && e.preventDefault) e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
  if (!evName || !evDate) return setMessage('Event name and date required')
  if (!evIncharge || !evInchargePhone) return setMessage('In-charge name and phone are required')
  if (!evLocation) return setMessage('Select a location')
  const body = { name: evName, description: evDesc || null, event_date: evDate, event_incharge: evIncharge || null, incharge_phone: evInchargePhone || null, event_location: evLocation }
      const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Failed to create event')
      setMessage('Event created')
      // reset form
    setEvName('')
    setEvDesc('')
    setEvDate('')
    setEvIncharge('')
    setEvInchargePhone('')
    setEvLocation('')
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  return (
    <div className="admin-card card">
      <h2>Admin Panel</h2>

      <div className="add-user-row">
        <label className="small">Add New User</label>
        <div className="inline-row">
          <input className="large-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <input className="large-input" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: 160 }} />
          <button onClick={addUser} style={{color: "white"}} className="primary small" disabled={loading || !username || !password}>{loading ? 'Adding...' : 'Add User'}</button>
        </div>
      </div>

      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f6' }} />

      <div className="delete-user">
        <label className="small">Delete User</label>
        <div className="inline-row">
          <input className="large-input" placeholder="Enter Username to Search" value={deleteUsername} onChange={e => setDeleteUsername(e.target.value)} />
          <button className="ghost" onClick={searchUser} style={{ marginLeft: 8 }} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        </div>

        <div style={{ height: 12 }} />

        <div className="delete-found-row">
          {searchResult ? (
            <>
              <div className="found">User found: <strong>{searchResult.username}</strong></div>
              <button className="ghost danger" onClick={() => deleteUser(searchResult.username)} disabled={loading}>{loading ? 'Working...' : 'Delete User'}</button>
            </>
          ) : notFound ? (
            <div className="found not-found">User not found</div>
          ) : (
            <div className="found">No user selected</div>
          )}
        </div>
      </div>

      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f6' }} />

      <div className="delete-range">
        <label className="small">Delete Returned Records by Date Range</label>
        <div className="inline-row" style={{ gap: 8, alignItems: 'center' }}>
          <input className="large-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <input className="large-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          <button className="ghost" onClick={previewDeleteRange} disabled={loading}>{loading ? 'Checking...' : 'Preview'}</button>
          <button className="ghost danger" onClick={deleteRange} disabled={loading || !fromDate || !toDate}>{loading ? 'Working...' : 'Delete Range'}</button>
        </div>
        {previewCount !== null && <div style={{ marginTop: 8 }}>Preview: <strong>{previewCount}</strong> records will be deleted</div>}
      </div>

      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f6' }} />

      <div className="create-event">
        <label className="small">Create Event</label>
        <form onSubmit={createEvent} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="large-input" placeholder="Event name" value={evName} onChange={e => setEvName(e.target.value)} required />
          <input className="large-input" placeholder="Description (optional)" value={evDesc} onChange={e => setEvDesc(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="large-input" type="date" value={evDate} onChange={e => setEvDate(e.target.value)} style={{ maxWidth: 220 }} required />
          </div>
          <label className="small" style={{ display: 'block', marginBottom: 8 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>In-charge</div>
            <input className="large-input" placeholder="In-charge name" value={evIncharge} onChange={e => setEvIncharge(e.target.value)} required />
          </label>

          <label className="small" style={{ display: 'block', marginBottom: 8 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>In-charge Phone</div>
            <input className="large-input" placeholder="In-charge phone" value={evInchargePhone} onChange={e => setEvInchargePhone(e.target.value)} style={{ maxWidth: 300 }} required />
          </label>

          <label className="small" style={{ display: 'block', marginBottom: 8 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Location</div>
            <select value={evLocation} onChange={e => setEvLocation(e.target.value)} style={{ padding: '8px', borderRadius: 4 }}>
              <option value="" disabled>-- Select Location --</option>
              <option value="gents location">Gents location</option>
              <option value="ladies location">Ladies location</option>
            </select>
          </label>
          <div>
            <button className="primary" type="submit" disabled={loading || !evName || !evDate || !evIncharge || !evInchargePhone}>{loading ? 'Working...' : 'Create Event'}</button>
          </div>
        </form>
      </div>

      {message && <div className="message">{message}</div>}
    </div>
  )
}
