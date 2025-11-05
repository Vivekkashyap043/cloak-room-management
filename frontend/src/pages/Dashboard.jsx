import React, { useState } from 'react'
import './Dashboard.css'
import EntryForm from '../components/EntryForm'
import ExitForm from '../components/ExitForm'
import AdminPanel from '../components/AdminPanel'
import EventManager from '../components/EventManager'
import EventSelector from '../components/EventSelector'

export default function Dashboard({ token, role, username, location, onLogout }) {
  const [tab, setTab] = useState('entry')
  const [selectedEvent, setSelectedEvent] = useState(() => {
    try { return localStorage.getItem('selectedEventName') || '' } catch (e) { return '' }
  })
  const [availableEvents, setAvailableEvents] = useState(null)
  const [lockEvent, setLockEvent] = useState(false)

  // When tab switches to entry, if there is exactly one available event for this user, lock selection
  React.useEffect(() => {
    // If there's exactly one available event, auto-select and lock only for Entry tab
    if (availableEvents && availableEvents.length === 1) {
      const single = availableEvents[0].name
      setSelectedEvent(single)
      try { localStorage.setItem('selectedEventName', single) } catch (e) {}
      setLockEvent(tab === 'entry')
      return
    }

    // For Exit tab: if there are multiple available events but nothing selected (or selected isn't valid),
    // auto-select the first available event so the user has a sensible default but can change it.
    if (tab === 'exit' && availableEvents && availableEvents.length > 0) {
      const found = availableEvents.find(e => e.name === selectedEvent)
      if (!selectedEvent || !found) {
        const first = availableEvents[0].name
        setSelectedEvent(first)
        try { localStorage.setItem('selectedEventName', first) } catch (e) {}
      }
    }

    // For other cases, ensure selection is not locked
    setLockEvent(false)
  }, [tab, availableEvents])

  return (
    <div className="app-root dashboard-root" style={{width: "100%"}}>
      <header className="top-header">
        <div className="top-brand">
          <h2 className="brand-title">Cloak Room Management</h2>
          <div className="brand-sub" style={{paddingLeft: '8px'}}>Securely store visitors' belongings — track by token</div>
        </div>
        <div className="top-actions">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className="welcome">Hello, <strong>{username || 'User'}</strong></span>
            {location && <span style={{ fontSize: 12, color: '#fff', opacity: 0.9 }}><span style={{opacity: 1, fontWeight: 500, color: "#ffffff", fontSize: 14}}>Location:</span> {location}</span>}
          </div>
          {/* Event selector moved beside card title (see below) - do not show in header for user dashboard */}
          <button className="logout-pill" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="tabs-row">
        <button className={tab === 'entry' ? 'tab active' : 'tab'} onClick={() => setTab('entry')}>Entry</button>
        <button className={tab === 'exit' ? 'tab active' : 'tab'} onClick={() => setTab('exit')}>Exit</button>
        <button className={tab === 'events' ? 'tab active' : 'tab'} onClick={() => setTab('events')}>Events</button>
        {role === 'admin' && <button className={tab === 'admin' ? 'tab active' : 'tab'} onClick={() => setTab('admin')}>Admin</button>}
      </div>

      <div className="dashboard-grid single">
        <section className="card entry-card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="card-title">{tab === 'entry' ? 'New Entry' : tab === 'exit' ? 'Exit' : 'Admin'}</h2>
            <div style={{ marginLeft: 'auto' }}>
              {/* Show EventSelector to the right of the card title; hide it for the 'events' tab (not necessary there) */}
              {tab !== 'events' && (
                <EventSelector token={token} onChange={name => setSelectedEvent(name)} className="light" disabled={lockEvent} onEventsLoaded={evs => setAvailableEvents(evs)} includeAll={tab === 'exit'} />
              )}
            </div>
          </div>

          <div className="card-body">
            {tab === 'entry' && <EntryForm token={token} eventName={selectedEvent} hasActiveEvents={availableEvents === null ? undefined : (availableEvents.length > 0)} />}
            {tab === 'exit' && <ExitForm token={token} eventName={selectedEvent} />}
            {tab === 'events' && <EventManager token={token} location={location} />}
            {tab === 'admin' && role === 'admin' && <AdminPanel token={token} />}
          </div>
        </section>
      </div>
    </div>
  )
}
