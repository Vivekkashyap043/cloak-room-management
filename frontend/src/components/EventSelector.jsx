import React, { useEffect, useState } from 'react'
import './EventSelector.css'

export default function EventSelector({ token, onChange, className }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const storageKey = 'selectedEventName'
  const [selected, setSelected] = useState(() => {
    try { return localStorage.getItem(storageKey) || '' } catch (e) { return '' }
  })

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/events', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
      setEvents(data.events || [])
      // do not auto-select the first event; leave empty by default
    } catch (err) {
      setError(err.message || 'Server error')
    } finally { setLoading(false) }
  }

  function onSelect(e) {
    const v = e.target.value
    setSelected(v)
    try { localStorage.setItem(storageKey, v) } catch (e) {}
    onChange && onChange(v)
  }

  return (
    <div className={`event-selector ${className || ''}`.trim()}>
      <label htmlFor="event-select" className="event-label">Event</label>
      <select id="event-select" value={selected} onChange={onSelect} disabled={loading}>
        <option value="">-- Select event --</option>
        {events && events.length ? events.map(ev => (
          <option key={ev.name} value={ev.name}>{ev.name}</option>
        )) : null}
      </select>
      {error && <div className="event-error">{error}</div>}
    </div>
  )
}
