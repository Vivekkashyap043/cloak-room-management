import React, { useState } from 'react'
import './Dashboard.css'
import EntryForm from '../components/EntryForm'
import ExitForm from '../components/ExitForm'
import AdminPanel from '../components/AdminPanel'

export default function Dashboard({ token, role, username, onLogout }) {
  const [tab, setTab] = useState('entry')

  return (
    <div className="app-root dashboard-root" style={{width: "100%"}}>
      <header className="top-header">
        <div className="top-brand">
          <h2 className="brand-title">Cloak Room Management</h2>
          <div className="brand-sub" style={{paddingLeft: '8px'}}>Securely store visitors' belongings — track by token</div>
        </div>
        <div className="top-actions">
          <span className="welcome">Hello, <strong>{username || 'User'}</strong></span>
          <button className="logout-pill" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="tabs-row">
        <button className={tab === 'entry' ? 'tab active' : 'tab'} onClick={() => setTab('entry')}>Entry</button>
        <button className={tab === 'exit' ? 'tab active' : 'tab'} onClick={() => setTab('exit')}>Exit</button>
      </div>

      <div className="dashboard-grid single">
        <section className="card entry-card">
          <div className="card-header">
            <h2 className="card-title">{tab === 'entry' ? 'New Entry' : tab === 'exit' ? 'Exit' : 'Admin'}</h2>
          </div>

          <div className="card-body">
            {tab === 'entry' && <EntryForm token={token} />}
            {tab === 'exit' && <ExitForm token={token} />}
            {tab === 'admin' && role === 'admin' && <AdminPanel token={token} />}
          </div>
        </section>
      </div>
    </div>
  )
}
