import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './AdminPanel.css'

export default function EventManager({ token, location }) {
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventIncharge, setNewEventIncharge] = useState('')
  const [newEventPhone, setNewEventPhone] = useState('')
  // location is provided by parent (user location) - do not ask in the form
  const [newEventMsg, setNewEventMsg] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { loadEvents() }, [])

  useEffect(() => {
    if (!newEventMsg) return
    const id = setTimeout(() => setNewEventMsg(null), 4200)
    return () => clearTimeout(id)
  }, [newEventMsg])

  const showNewEventMsg = (type, text) => setNewEventMsg({ type, text })

  async function loadEvents() {
    setEventsLoading(true)
    try {
      const url = '/api/events'
      const res = await fetch(url, { headers: { Authorization: token ? 'Bearer ' + token : '' } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
      // show events only for the user's location
      const loc = location || ''
      const all = data.events || []
      const filtered = loc ? all.filter(ev => (ev.event_location || '').toLowerCase() === String(loc).toLowerCase()) : all
      setEvents(filtered)
    } catch (err) {
      showNewEventMsg('error', err.message || 'Failed to load events')
    } finally { setEventsLoading(false) }
  }

  async function createEvent(e) {
    e?.preventDefault()
    if (!newEventName.trim()) return showNewEventMsg('error', 'Event name required')
    if (!newEventDate) return showNewEventMsg('error', 'Event date required')
    if (!newEventIncharge.trim()) return showNewEventMsg('error', 'In-charge name required')
    if (!newEventPhone.trim()) return showNewEventMsg('error', 'In-charge phone required')
    // enforce single active event per location: if there is an active event at this user's location, disallow creation
    const loc = location || ''
    const hasActive = events && events.some(ev => ev.event_status === 'active')
    if (hasActive) return showNewEventMsg('error', 'An active event already exists for your location. End it before creating a new event.')
    try {
      const payload = { name: newEventName.trim(), description: newEventDesc.trim() }
      if (newEventDate) payload.event_date = newEventDate
      if (newEventIncharge) payload.event_incharge = newEventIncharge
      if (newEventPhone) payload.incharge_phone = newEventPhone
      // set event_location to the user's location (server expects event_location)
      if (loc) payload.event_location = loc
  const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Create failed')
  showNewEventMsg('success', `Event "${newEventName.trim()}" created`)
  setNewEventName(''); setNewEventDesc(''); setNewEventDate(''); setNewEventIncharge(''); setNewEventPhone('');
      loadEvents()
    } catch (err) { showNewEventMsg('error', err.message || 'Server error') }
  }

  async function toggleEventStatus(id, name, desiredStatus) {
    if (!id) return showNewEventMsg('error', 'Missing event id')
    try {
  const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ event_status: desiredStatus }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Update failed')
      showNewEventMsg('success', `Event "${name || id}" updated`)
      await loadEvents()
    } catch (err) { showNewEventMsg('error', err.message || 'Server error') }
  }

  return (
    <div className="panel">
      <h3 className="panel-title">Events Management</h3>
      <form className="form-vertical" onSubmit={createEvent}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Event Name</div>
          <input style={{ width: '100%' }} value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="Event name" />
        </label>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Event Date</div>
          <input style={{ width: '100%', padding: '8px 10px' }} type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
        </label>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Description</div>
          <input style={{ width: '100%' }} value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder="Short description (optional)" />
        </label>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>In-charge</div>
          <input style={{ width: '100%' }} value={newEventIncharge} onChange={e => setNewEventIncharge(e.target.value)} placeholder="In-charge name" required />
        </label>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>In-charge Phone</div>
          <input style={{ width: '100%' }} value={newEventPhone} onChange={e => setNewEventPhone(e.target.value)} placeholder="Phone number" required />
        </label>

        {/* Location is determined from your account/location and is not editable here. */}

        {newEventMsg && (
          <div style={{ marginTop: 6 }} className={`msg ${newEventMsg.type}`}>
            {newEventMsg.text}
          </div>
        )}

        <div className="row-actions" style={{ marginTop: 8 }}>
          <button className="btn-primary" type="submit" disabled={events && events.some(ev => ev.event_status === 'active')}>Create Event</button>
        </div>
      </form>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Active Events</h4>
          <div>
            <button className="btn-clear" onClick={() => loadEvents()} style={{ marginRight: 8 }}>Refresh</button>
          </div>
        </div>

        {eventsLoading ? (
          <div className="empty-note">Loading events...</div>
        ) : events && events.length ? (
          <div className="events-card-list">
            {events.map(ev => (
              <div key={ev.id} className="event-card">
                <div className="event-card-main">
                  <div className="event-name">{ev.name}</div>
                </div>
                <div className="event-meta">
                  <div className="event-date">{ev.event_date || '-'}</div>
                </div>
                <div className="event-actions">
                  {ev.event_status === 'active' && (
                    <button className="btn-end" onClick={() => toggleEventStatus(ev.id, ev.name, 'inactive')}>End the Event</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-note">No active events.</div>
        )}
      </div>
    </div>
  )
}
