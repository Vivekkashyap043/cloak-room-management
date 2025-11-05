import React, { useEffect, useState } from 'react'
import './EventSelector.css'

export default function EventSelector({ token, onChange, className, disabled, onEventsLoaded, includeAll }) {
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
    // Reload events whenever includeAll or token changes (e.g., when switching tabs)
    useEffect(() => {
      load()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeAll, token])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const qs = includeAll ? '?allForUser=true' : ''
      const res = await fetch('/api/events' + qs, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
  setEvents(data.events || [])
  try { onEventsLoaded && onEventsLoaded(data.events || []) } catch (e) {}
        // If nothing selected, pick a sensible default:
        // - When includeAll is true (Exit tab): prefer the first active event if present, otherwise keep first item
        // - Otherwise, if only one event returned, auto-select it (existing behavior)
        try {
          if ((!selected || selected === '') && data.events && data.events.length) {
            let pick = null
            if (includeAll) {
              pick = (data.events.find(ev => ev.event_status === 'active') || data.events[0]).name
            } else if (data.events.length === 1) {
              pick = data.events[0].name
            }
            if (pick) {
              setSelected(pick)
              try { localStorage.setItem(storageKey, pick) } catch (e) {}
              onChange && onChange(pick)
            }
          }
        } catch (e) {}
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
  <select id="event-select" value={selected} onChange={onSelect} disabled={loading || !!disabled}>
        <option value="">-- Select event --</option>
        {events && events.length ? events.map(ev => (
          <option key={ev.name} value={ev.name}>{ev.name}</option>
        )) : null}
      </select>
      {error && <div className="event-error">{error}</div>}
    </div>
  )
}
