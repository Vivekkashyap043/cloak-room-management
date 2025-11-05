import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from 'react-router-dom'
import AdminReport from './AdminReport'
import "./AdminDashboard.css";

/**
 * Exact-match Admin Dashboard
 * Props: token, username, onLogout
 *
 * Backend endpoints used (adjust if needed):
 *  - POST   /api/admin/users            (create user) body: { username, password }
 *  - GET    /api/admin/users/:query     (search user) returns { user }
 *  - DELETE /api/admin/users/:username  (delete user)
 */

export default function AdminDashboard({ token, username, onLogout }) {
  // user creation
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [newUserMsg, setNewUserMsg] = useState(null); // { type: 'success'|'error'|'info', text }

  // user search/delete
  const [query, setQuery] = useState("");
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(null); // { type, text }

  // database deletion controls
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletingRange, setDeletingRange] = useState(false);

  // toasts
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  const showToast = (type, text) => setToast({ type, text });

  // inline add-user message (auto-dismiss)
  useEffect(() => {
    if (!newUserMsg) return;
    const id = setTimeout(() => setNewUserMsg(null), 4200);
    return () => clearTimeout(id);
  }, [newUserMsg]);
  const showNewUserMsg = (type, text) => setNewUserMsg({ type, text });
  const showDeleteMsg = (type, text) => setDeleteMsg({ type, text });

  // Events management state
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventIncharge, setNewEventIncharge] = useState('')
  const [newEventPhone, setNewEventPhone] = useState('')
  const [newEventLocation, setNewEventLocation] = useState('')
  const [newEventMsg, setNewEventMsg] = useState(null); // { type: 'success'|'error'|'info', text }
  const navigate = useNavigate()
  const [showReport, setShowReport] = useState(false)
  useEffect(() => { loadEvents() }, [])

  // auto-dismiss new event inline message
  useEffect(() => {
    if (!newEventMsg) return;
    const id = setTimeout(() => setNewEventMsg(null), 4200);
    return () => clearTimeout(id);
  }, [newEventMsg]);
  const showNewEventMsg = (type, text) => setNewEventMsg({ type, text });

  async function loadEvents() {
    setEventsLoading(true)
    try {
      const url = '/api/events'
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
      setEvents(data.events || [])
    } catch (err) {
      showToast('error', err.message || 'Failed to load events')
    } finally { setEventsLoading(false) }
  }

  async function createEvent(e) {
    e?.preventDefault()
  if (!newEventName.trim()) return showNewEventMsg('error', 'Event name required')
  if (!newEventDate) return showNewEventMsg('error', 'Event date required')
  if (!newEventIncharge.trim()) return showNewEventMsg('error', 'In-charge name required')
  if (!newEventPhone.trim()) return showNewEventMsg('error', 'In-charge phone required')
  if (!newEventLocation) return showNewEventMsg('error', 'Select a location')
    try {
      const payload = { name: newEventName.trim(), description: newEventDesc.trim() }
      if (newEventDate) payload.event_date = newEventDate
      if (newEventIncharge) payload.event_incharge = newEventIncharge
      if (newEventPhone) payload.incharge_phone = newEventPhone
      if (newEventLocation) payload.event_location = newEventLocation
      // event_status omitted — server defaults to 'active'
      const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Create failed')
      showNewEventMsg('success', `Event "${newEventName.trim()}" created`)
      setNewEventName(''); setNewEventDesc('')
      setNewEventDate(''); setNewEventIncharge(''); setNewEventPhone(''); setNewEventLocation('')
      loadEvents()
    } catch (err) { showNewEventMsg('error', err.message || 'Server error') }
  }

  async function deleteEvent(id, name) {
    if (!id) return
    setConfirmModal({ open: true, type: 'single', payload: { id, name } })
  }

  async function toggleEventStatus(id, name, desiredStatus) {
    if (!id) return showToast('error', 'Missing event id')
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ event_status: desiredStatus }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Update failed')
      showToast('success', `Event "${name || id}" updated`)
      await loadEvents()
    } catch (err) { showToast('error', err.message || 'Server error') }
  }


  // Range preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // Confirmation for delete-by-filters (no preview)
  const [showDeleteRangeConfirm, setShowDeleteRangeConfirm] = useState(false);
  // filter-based deletion state
  const [filterEvent, setFilterEvent] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterLocation, setFilterLocation] = useState([]);

  // Robust MultiSelectDropdown — fixed: dropdown no longer closes when user clicks checkboxes
  function MultiSelectDropdown({ options = [], selected = [], onChange, placeholder = 'Select', label }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    // Close when clicking outside — use composedPath for robustness
    useEffect(() => {
      function onDocPointer(e) {
        try {
          const path = (e.composedPath && e.composedPath()) || (e.path || []);
          if (!rootRef.current) return;
          // if any element in path is inside our component, don't close
          if (path && path.length && path.indexOf(rootRef.current) >= 0) return;
          if (rootRef.current.contains(e.target)) return;
          setOpen(false);
        } catch (err) {
          if (!rootRef.current) return;
          if (!rootRef.current.contains(e.target)) setOpen(false);
        }
      }
      document.addEventListener('pointerdown', onDocPointer);
      return () => document.removeEventListener('pointerdown', onDocPointer);
    }, []);

    const toggleVal = (val) => {
      const next = selected && selected.length ? [...selected] : [];
      const idx = next.indexOf(val);
      if (idx >= 0) next.splice(idx, 1);
      else next.push(val);
      onChange(next);
    };

    // Keep display minimal and ellipsized; full list shown in title attribute
    const display = (selected && selected.length)
      ? `${selected[0]}${selected.length > 1 ? ' ...' : ''}`
      : placeholder;

    return (
      <div className="msd-root" ref={rootRef} style={{ position: 'relative' }}>
        {label && <div style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>}
        <button
          type="button"
          className="msd-button"
          onClick={(e) => { e.preventDefault(); setOpen(s => !s); }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="msd-button-text" title={(selected && selected.length) ? selected.join(', ') : placeholder}>
            {display}
          </span>
          <span className="msd-button-caret" aria-hidden>{open ? '▴' : '▾'}</span>
        </button>

        {open && (
          <div
            className="msd-panel"
            role="listbox"
            aria-multiselectable="true"
            style={{ position: 'absolute', zIndex: 80, top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 220, overflow: 'auto', background: 'white', border: '1px solid #ddd', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', padding: 8 }}
            onMouseDown={(e) => {
              // stop propagation of pointer/mouse events so document listener won't close the dropdown
              e.stopPropagation();
            }}
            onClick={(e) => {
              // also stop click propagation just in case
              e.stopPropagation();
            }}
          >
            {options && options.length ? options.map(opt => {
              const checked = (selected || []).indexOf(opt.value) >= 0;
              return (
                <label
                  key={opt.value}
                  className="msd-option"
                  style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer' }}
                  onClick={(e) => e.stopPropagation()} /* extra safety */
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      // stop event propagation to avoid closing dropdown
                      e.stopPropagation();
                      toggleVal(opt.value);
                    }}
                  />
                  <span style={{ marginLeft: 8 }}>{opt.label}</span>
                </label>
              );
            }) : (
              <div style={{ padding: 8, color: '#666' }}>No options</div>
            )}
          </div>
        )}
      </div>
    );
  }

  async function createUser(e) {
    e?.preventDefault();
    if (!newUser.trim() || !newPass || !newLocation) {
      const msg = 'Provide username, password & location.';
      showToast('error', msg);
      showNewUserMsg('error', msg);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ username: newUser.trim(), password: newPass, location: newLocation }),
      });
      let data = {};
      try { data = await res.json(); } catch (err) { }
      if (!res.ok) throw new Error((data && data.message) || res.statusText || "Failed");
      const createdName = (data && data.username) || newUser;
      showToast("success", `User "${createdName}" created`);
      showNewUserMsg('success', `User "${createdName}" created`);
      setNewUser(""); setNewPass("");
      // reset location
      setNewLocation('');
    } catch (err) {
      const msg = err && err.message ? err.message : 'Server error';
      showToast("error", msg);
      showNewUserMsg('error', msg);
    } finally { setCreating(false); }
  }

  async function searchUser(e) {
    e?.preventDefault();
    setDeleteMsg(null);
    if (!query.trim()) return showToast("info", "Enter username or email to search.");
    setSearching(true); setFound(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(query.trim())}`, { headers: { Authorization: "Bearer " + token } });
      let data = {};
      try { data = await res.json(); } catch (err) { }
      if (!res.ok) {
        if (res.status === 404) {
          showDeleteMsg('error', 'User not found');
        } else {
          showToast("error", (data && data.message) || res.statusText || "Not found");
        }
      } else if (!data.user) {
        showDeleteMsg('error', 'User not found');
      } else {
        setFound(data.user);
        showDeleteMsg('success', 'User found');
      }
    } catch { showToast("error", "Server error"); }
    finally { setSearching(false); }
  }

  async function deleteUser() {
    if (!found?.username) return;
    if (!window.confirm(`Delete ${found.username}? This cannot be undone.`)) return;
    setDeletingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(found.username)}`, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      let data = {};
      try { data = await res.json(); } catch (err) { }
      if (!res.ok) {
        if (res.status === 404) {
          showDeleteMsg('error', 'User not found');
          throw new Error('User not found');
        }
        throw new Error((data && data.message) || res.statusText || "Delete failed");
      }
      showToast("success", `User "${found.username}" deleted`);
      showDeleteMsg('success', `User "${found.username}" deleted`);
      setFound(null); setQuery("");
    } catch (err) { showToast("error", err.message || "Server error"); }
    finally { setDeletingUser(false); }
  }

  // legacy permanent-purge handlers removed (use filter-based deletes)

  // NOTE: previewRange removed from the delete flow. We keep preview helpers
  // in case they are needed later, but the current flow opens a confirmation
  // modal directly when the user clicks Delete.
  async function previewRange(e) {
    e?.preventDefault();
    setPreviewLoading(true); setPreviewRows([]); setPreviewCount(0);
    try {
      const parts = [];
      if (filterEvent && filterEvent.length) filterEvent.forEach(v => parts.push(`event=${encodeURIComponent(v)}`));
      if (filterLocation && filterLocation.length) filterLocation.forEach(v => parts.push(`location=${encodeURIComponent(v)}`));
      if (filterStatus && filterStatus.length) filterStatus.forEach(v => parts.push(`status=${encodeURIComponent(v)}`));
      if (fromDate) parts.push(`from=${encodeURIComponent(fromDate)}`);
      if (toDate) parts.push(`to=${encodeURIComponent(toDate)}`);
      if (!parts.length) return showToast('error', 'Select at least one filter (event, location, status, from, to)');
      const q = parts.length ? `?${parts.join('&')}` : '';
      const res = await fetch(`/api/admin/records/preview-filter${q}`, { headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) { }
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Preview failed');
      setPreviewRows(data.rows || []);
      setPreviewCount(data.count || (data.rows && data.rows.length) || 0);
      setShowPreviewModal(true);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setPreviewLoading(false); }
  }

  async function confirmDeleteRange() {
    setDeletingRange(true);
    try {
      const parts = [];
      if (filterEvent && filterEvent.length) filterEvent.forEach(v => parts.push(`event=${encodeURIComponent(v)}`));
      if (filterLocation && filterLocation.length) filterLocation.forEach(v => parts.push(`location=${encodeURIComponent(v)}`));
      if (filterStatus && filterStatus.length) filterStatus.forEach(v => parts.push(`status=${encodeURIComponent(v)}`));
      if (fromDate) parts.push(`from=${encodeURIComponent(fromDate)}`);
      if (toDate) parts.push(`to=${encodeURIComponent(toDate)}`);
      if (!parts.length) return showToast('error', 'Select at least one filter to delete (event, location, status, from, to)');
      const q = `?${parts.join('&')}`;
      const res = await fetch(`/api/admin/records${q}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) { }
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Delete failed');
      showToast('success', `Deleted ${data.deletedRows || 0} record(s)`);
      setFromDate(''); setToDate(''); setFilterEvent([]); setFilterStatus([]); setFilterLocation([]); setShowPreviewModal(false); setPreviewRows([]); setPreviewCount(0);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setDeletingRange(false); }
  }

  function handleDeleteClick(e) {
    e?.preventDefault();
    const parts = [];
    if (filterEvent && filterEvent.length) filterEvent.forEach(v => parts.push(`event=${encodeURIComponent(v)}`));
    if (filterLocation && filterLocation.length) filterLocation.forEach(v => parts.push(`location=${encodeURIComponent(v)}`));
    if (filterStatus && filterStatus.length) filterStatus.forEach(v => parts.push(`status=${encodeURIComponent(v)}`));
    if (fromDate) parts.push(`from=${encodeURIComponent(fromDate)}`);
    if (toDate) parts.push(`to=${encodeURIComponent(toDate)}`);
    if (!parts.length) return showToast('error', 'Select at least one filter to delete (event, location, status, from, to)');
    setShowDeleteRangeConfirm(true);
  }

  function performDeleteRangeConfirmed() {
    setShowDeleteRangeConfirm(false);
    confirmDeleteRange();
  }

  // Confirmation modal state for event deletions
  const [confirmModal, setConfirmModal] = useState({ open: false, type: null, payload: null, working: false })

  async function performConfirmedDelete() {
    if (!confirmModal || !confirmModal.open) return
    const { type, payload } = confirmModal
    setConfirmModal(m => ({ ...m, working: true }))
    try {
      if (type === 'single') {
        const id = payload && payload.id
        const name = payload && payload.name
        if (!id) throw new Error('Missing event id')
        const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        showToast('success', `Event "${name || id}" deleted`)
      } else {
        // Other deletion flows (selected/all) are handled on the All Events page
        showToast('info', 'Bulk deletes are available on the All Events page')
      }
  // reload and close modal
  await loadEvents()
      setConfirmModal({ open: false, type: null, payload: null, working: false })
    } catch (err) {
      showToast('error', err.message || 'Server error')
      setConfirmModal(m => ({ ...m, working: false }))
    }
  }

  function closeConfirmModal() { setConfirmModal({ open: false, type: null, payload: null, working: false }) }

  return (
    <div className="adm-root">
      {toast && (
        <div className={`floating-toast ${toast.type}`} role="status" aria-live="polite">
          <div className="toast-text">{toast.text}</div>
        </div>
      )}
      <header className="top-header">
        <div className="top-brand">
          <h2 className="brand-title">Admin Dashboard</h2>
          <div className="brand-sub" style={{ paddingLeft: "8px" }}>Manage users & data</div>
        </div>
        <div className="top-actions">
          <span className="welcome">Welcome, <strong>{username || 'Admin'}</strong> &nbsp; </span>
          <button className="logout-pill" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="adm-container">
        <div className="adm-grid">
          <section className="card left-card">

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

                <label style={{ display: 'block', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>Location</div>
                  <select value={newEventLocation} onChange={e => setNewEventLocation(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="" disabled>-- Select Location --</option>
                    <option value="gents location">gents location</option>
                    <option value="ladies location">ladies location</option>
                  </select>
                </label>

                {newEventMsg && (
                  <div style={{ marginTop: 6 }} className={`msg ${newEventMsg.type}`}>
                    {newEventMsg.text}
                  </div>
                )}

                <div className="row-actions">
                  <button className="btn-primary" type="submit" disabled={eventsLoading || !newEventName || !newEventDate || !newEventIncharge || !newEventPhone}>{eventsLoading ? 'Working...' : 'Create Event'}</button>
                </div>
              </form>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>Active Events</h4>
                  <div>
                    <button className="btn-clear" onClick={() => loadEvents()} style={{ marginRight: 8 }}>Refresh</button>
                      <button className="btn-clear" onClick={() => navigate('/admin/events')} style={{ marginRight: 8 }}>View All Events</button>
                      <button className="btn-clear" onClick={() => { setShowReport(s => !s); /* also allow navigation via route */ }} style={{ marginRight: 8 }}>{showReport ? 'Hide Report' : 'Show Report'}</button>
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
                            <div className="event-location">{ev.event_location || '-'}</div>
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
              {/* New Report section below Events Management */}
              <div style={{ marginTop: 18 }} className="panel">
                <h3 className="panel-title">Report</h3>
                <p className="small">Generate a comprehensive report of recent records including items and photos. Click View Report to open the full report page.</p>
                <div style={{ marginTop: 8 }}>
                  <button className="btn-primary" onClick={() => navigate('/admin/report')}>View Report</button>
                </div>
              </div>
              {/* Inline admin report panel (toggleable) */}
              {showReport && (
                <div style={{ marginTop: 16 }}>
                  <AdminReport token={token} username={username} onLogout={onLogout} />
                </div>
              )}
            </div>

          </section>

          <aside className="card right-card">
            <h2 className="card-heading">User Management</h2>
            <div className="panel">
              <h3 className="panel-title">Add New User</h3>
              <form className="form-vertical" onSubmit={createUser}>
                <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="Username" />
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Password" />
                <select value={newLocation} onChange={e => setNewLocation(e.target.value)}>
                  <option value="" disabled>Select location</option>
                  <option value="gents location">gents location</option>
                  <option value="ladies location">ladies location</option>
                </select>
                {newUserMsg && (
                  <div style={{ marginTop: 6 }} className={`msg ${newUserMsg.type}`}>
                    {newUserMsg.text}
                  </div>
                )}
                <div className="row-actions">
                  <button className="btn-primary" type="submit" disabled={creating}>{creating ? "Creating..." : "Add User"}</button>
                </div>
              </form>
            </div>

            <hr className="divider" />

            <div className="panel">
              <h3 className="panel-title">Delete User</h3>
              <form className="search-form" onSubmit={searchUser}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter username" />
                <button className="btn-search" type="submit" disabled={searching}>{searching ? "Searching..." : "Search"}</button>
              </form>

              {deleteMsg && (
                <div style={{ marginTop: 8 }} className={`msg ${deleteMsg.type}`}>
                  {deleteMsg.text}
                </div>
              )}
              {found ? (
                <div className="found-box">
                  <div className="found-header">
                    <div className="found-left">
                      <div className="avatar">{(found.username || "U").charAt(0).toUpperCase()}</div>
                      <div className="found-meta">
                        <div className="found-name">{found.username}</div>
                        <div className="found-role">Role: {found.role || "user"}</div>
                      </div>
                    </div>
                    <div className="found-actions">
                      <button className="btn-clear" onClick={() => { setFound(null); setQuery(""); }}>Clear</button>
                      <button className="btn-danger" onClick={deleteUser} disabled={deletingUser}>{deletingUser ? "Deleting..." : "Delete User"}</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-note"></div>
              )}

            </div>

            <hr className="divider" />

            <div className="db-inner">
              <div className="db-white-head"><h3>Database Management</h3></div>

              {/* Removed old "type DELETE" permanent purge UI; use filter-based deletes below */}
              <hr />

              <div className="db-range">
                <h4>Delete records by filters</h4>
                <p className="small">Choose any combination of Event, Status, From and To dates. At least one filter is required.</p>
                <form className="range-form" onSubmit={handleDeleteClick}>
                  <label className="range-field">
                    <MultiSelectDropdown
                      label="Event"
                      options={events.map(ev => ({ value: ev.name, label: ev.name }))}
                      selected={filterEvent}
                      onChange={setFilterEvent}
                      placeholder="-- Select Event --"
                    />
                  </label>
                  <label className="range-field">
                    <div>Status</div>
                    <MultiSelectDropdown
                      options={[{ value: 'deposited', label: 'deposited' }, { value: 'returned', label: 'returned' }]}
                      selected={filterStatus}
                      onChange={setFilterStatus}
                      placeholder="-- Select Status --"
                    />
                  </label>
                  <label className="range-field">
                    <div>From</div>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  </label>
                  <label className="range-field">
                    <div>To</div>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                  </label>
                  <label className="range-field">
                    <div>Location</div>
                    <MultiSelectDropdown
                      options={[{ value: 'gents location', label: 'gents location' }, { value: 'ladies location', label: 'ladies location' }]}
                      selected={filterLocation}
                      onChange={setFilterLocation}
                      placeholder="-- Select Location --"
                    />
                  </label>
                  <div className="range-actions" style={{ marginTop: 10 }}>
                    <button className="btn-danger-wide" type="submit" disabled={deletingRange}>{deletingRange ? 'Deleting...' : 'Delete'}</button>
                  </div>
                </form>
              </div>

              <div className="db-note">Click Delete to permanently remove records that match the selected filters (confirmation required).</div>
            </div>
          </aside>
        </div>
      </div>

      {/* Confirmation modal for deleting records by filters (no preview) */}
      {showDeleteRangeConfirm && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Confirm delete</h3>
            <p className="small">This will permanently delete records that match the following filters:</p>
            <p className="small">{(filterEvent && filterEvent.length) ? `Event: ${filterEvent.join(', ')}` : ''} {(filterLocation && filterLocation.length) ? ` Location: ${filterLocation.join(', ')}` : ''} {(filterStatus && filterStatus.length) ? ` Status: ${filterStatus.join(', ')}` : ''} {fromDate ? ` From: ${fromDate}` : ''} {toDate ? ` To: ${toDate}` : ''}.</p>
            <div className="modal-actions">
              <button className="btn-clear" onClick={() => setShowDeleteRangeConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={performDeleteRangeConfirmed} disabled={deletingRange}>{deletingRange ? 'Deleting...' : 'Confirm Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* old permanent purge modal removed */}
      {/* Confirmation modal for event deletions */}
      {confirmModal && confirmModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Are you sure want to delete?</h3>
            <p className="small">
              {confirmModal.type === 'single' && (`This will delete event "${confirmModal.payload && confirmModal.payload.name}".`)}
              {confirmModal.type === 'selected' && (`This will delete ${confirmModal.payload && confirmModal.payload.names ? confirmModal.payload.names.length : 0} selected events.`)}
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
  );
}
