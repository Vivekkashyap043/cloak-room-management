import React, { useState } from 'react'
import './Dashboard.css'
import EntryForm from '../components/EntryForm'
import ExitForm from '../components/ExitForm'
import AdminPanel from '../components/AdminPanel'
import EventSelector from '../components/EventSelector'

export default function Dashboard({ token, role, username, location, onLogout }) {
  const [tab, setTab] = useState('entry')
  const [selectedEvent, setSelectedEvent] = useState(() => {
    try { return localStorage.getItem('selectedEventName') || '' } catch (e) { return '' }
  })

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
      </div>

      <div className="dashboard-grid single">
        <section className="card entry-card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="card-title">{tab === 'entry' ? 'New Entry' : tab === 'exit' ? 'Exit' : 'Admin'}</h2>
            <div style={{ marginLeft: 'auto' }}>
              {/* Show EventSelector to the right of the card title; use light style for white card */}
              <EventSelector token={token} onChange={name => setSelectedEvent(name)} className="light" />
            </div>
          </div>

          <div className="card-body">
            {tab === 'entry' && <EntryForm token={token} eventName={selectedEvent} />}
            {tab === 'exit' && <ExitForm token={token} eventName={selectedEvent} />}
            {tab === 'admin' && role === 'admin' && <AdminPanel token={token} />}
          </div>
        </section>
      </div>
    </div>
  )
}
