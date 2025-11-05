import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './AdminDashboard.css'

export default function AdminEvents({ token, username, onLogout }) {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState([])
  const [confirmModal, setConfirmModal] = useState({ open: false, type: null, payload: null, working: false })

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    try {
      const res = await fetch('/api/events?all=true', { headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
      setEvents(data.events || [])
      setSelectedEvents([])
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to load events')
    } finally { setLoading(false) }
  }

  function confirmSingleDelete(id, name) {
    setConfirmModal({ open: true, type: 'single', payload: { id, name }, working: false })
  }

  function confirmSelectedDelete() {
    if (!selectedEvents.length) return alert('Select events to delete')
    // selectedEvents contains ids
    setConfirmModal({ open: true, type: 'selected', payload: { ids: selectedEvents.slice() }, working: false })
  }

  function confirmAllDelete() {
    if (!events || !events.length) return alert('No events to delete')
    setConfirmModal({ open: true, type: 'all', payload: {}, working: false })
  }

  async function performConfirmedDelete() {
    if (!confirmModal || !confirmModal.open) return
    setConfirmModal(m => ({ ...m, working: true }))
    try {
      if (confirmModal.type === 'single') {
        const id = confirmModal.payload && confirmModal.payload.id
        const name = confirmModal.payload && confirmModal.payload.name
        const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        alert(`Event "${name || id}" deleted`)
      } else if (confirmModal.type === 'selected') {
        const ids = confirmModal.payload && confirmModal.payload.ids ? confirmModal.payload.ids : []
        const res = await fetch(`/api/admin/events`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ ids }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        alert(`Deleted ${data.deleted || ids.length} events`)
        setSelectedEvents([])
      } else if (confirmModal.type === 'all') {
        const res = await fetch('/api/admin/events?all=true', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        alert('All events deleted')
      }
      await loadEvents()
      setConfirmModal({ open: false, type: null, payload: null, working: false })
    } catch (err) {
      alert(err.message || 'Server error')
      setConfirmModal(m => ({ ...m, working: false }))
    }
  }

  function closeConfirmModal() { setConfirmModal({ open: false, type: null, payload: null, working: false }) }

  async function toggleEventStatus(id, desiredStatus) {
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ event_status: desiredStatus }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Update failed')
      await loadEvents()
    } catch (err) { alert(err.message || 'Server error') }
  }

  return (
    <div className="adm-root">
      <header className="top-header">
        <div className="top-brand">
          <h2 className="brand-title">All Events (Admin)</h2>
          <div className="brand-sub" style={{ paddingLeft: 8 }}>List of all events and management actions</div>
        </div>
        <div className="top-actions">
          <button className="logout-pill" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="adm-container">
        <div className="adm-grid">
          <section className="card left-card" style={{ gridColumn: '1 / -1' }}>
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>All Events</h3>
                <div>
                  <button className="btn-clear" onClick={loadEvents} style={{ marginRight: 8 }}>Refresh</button>
                  <button className="btn-danger" onClick={confirmAllDelete} style={{ marginRight: 8 }}>Delete ALL Events</button>
                  <button className="btn-danger" onClick={confirmSelectedDelete} disabled={!selectedEvents.length}>Delete Selected</button>
                </div>
              </div>

              {loading ? (
                <div className="empty-note">Loading events...</div>
              ) : events && events.length ? (
                <table className="events-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>In-charge</th>
                      <th>Phone</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(ev => (
                      <tr key={ev.id}>
                        <td>
                          <input type="checkbox" checked={selectedEvents.includes(ev.id)} onChange={e => {
                            const next = e.target.checked ? [...selectedEvents, ev.id] : selectedEvents.filter(x => x !== ev.id)
                            setSelectedEvents(next)
                          }} />
                        </td>
                        <td>{ev.name}</td>
                        <td>{ev.description || '-'}</td>
                        <td>{ev.event_date || '-'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ev.event_location || '-'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ev.event_status || '-'}</td>
                        <td>{ev.event_incharge || '-'}</td>
                        <td>{ev.incharge_phone || '-'}</td>
                        <td>{ev.created_at || '-'}</td>
                          <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="delete-btn" onClick={() => confirmSingleDelete(ev.id, ev.name)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-note">No events present.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      {confirmModal && confirmModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Are you sure want to delete?</h3>
                  <p className="small">
                    {confirmModal.type === 'single' && (`This will delete event "${confirmModal.payload && confirmModal.payload.name}."`)}
                    {confirmModal.type === 'selected' && (`This will delete ${confirmModal.payload && confirmModal.payload.ids ? confirmModal.payload.ids.length : 0} selected events.`)}
                    {confirmModal.type === 'all' && ("This will delete ALL events. This action cannot be undone.")}
                  </p>
            <div className="modal-actions">
              <button className="btn-clear" onClick={closeConfirmModal} disabled={confirmModal.working}>Cancel</button>
              <button className="btn-danger" onClick={performConfirmedDelete} disabled={confirmModal.working}>{confirmModal.working ? 'Deleting...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
