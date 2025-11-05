import React, { useState, useEffect, useRef } from "react";
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

  // Permanent purge preview state (removed - using filter-based deletes)

  // Events management state
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [selectedEvents, setSelectedEvents] = useState([])

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setEventsLoading(true)
    try {
      const res = await fetch('/api/events', { headers: { Authorization: 'Bearer ' + token } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load events')
      setEvents(data.events || [])
      // clear any selected events when reloading (prevents stale selection)
      setSelectedEvents([])
    } catch (err) {
      showToast('error', err.message || 'Failed to load events')
    } finally { setEventsLoading(false) }
  }

  async function createEvent(e) {
    e?.preventDefault()
    if (!newEventName.trim()) return showToast('error', 'Event name required')
    try {
      const payload = { name: newEventName.trim(), description: newEventDesc.trim() }
      if (newEventDate) payload.event_date = newEventDate
      const res = await fetch('/api/admin/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Create failed')
      showToast('success', `Event "${newEventName.trim()}" created`)
      setNewEventName(''); setNewEventDesc('')
      loadEvents()
    } catch (err) { showToast('error', err.message || 'Server error') }
  }

  async function deleteEvent(name) {
    // open confirmation modal for single delete
    if (!name) return
    setConfirmModal({ open: true, type: 'single', payload: { name } })
  }

  async function deleteSelectedEvents() {
    if (!selectedEvents.length) return showToast('info', 'Select events to delete')
    setConfirmModal({ open: true, type: 'selected', payload: { names: selectedEvents.slice() } })
  }

  async function deleteAllEvents() {
    if (!events || !events.length) return showToast('info', 'No events to delete')
    setConfirmModal({ open: true, type: 'all', payload: {} })
  }

  // Range preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // filter-based deletion state
  const [filterEvent, setFilterEvent] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterLocation, setFilterLocation] = useState([]);

  // Simple reusable dropdown with checkboxes for multi-select UX (replaces native <select multiple>)
  function MultiSelectDropdown({ options = [], selected = [], onChange, placeholder = 'Select', label }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Attach a mousedown listener to the document and close only when the
    // event target is outside this component. This simpler contains-based
    // check avoids issues where checkbox clicks inadvertently close the panel.
    useEffect(() => {
      function handleClickOutside(e) {
        if (!ref.current) return;
        if (!ref.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleVal = (val) => {
      const next = selected && selected.length ? [...selected] : [];
      const idx = next.indexOf(val);
      if (idx >= 0) next.splice(idx, 1);
      else next.push(val);
      onChange(next);
    };

    const display = (selected && selected.length) ? `${selected.join(', ')}` : placeholder;

    return (
      <div className="msd-root" ref={ref} style={{ position: 'relative' }}>
        {label && <div style={{ fontSize: 13, marginBottom: 6 }}>{label}</div>}
        <button type="button" className="msd-button" onClick={() => setOpen(s => !s)} style={{ width: '100%', textAlign: 'left', padding: '8px 10px' }}>
          {display}
          <span style={{ float: 'right', opacity: 0.6 }}>{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="msd-panel" style={{ position: 'absolute', zIndex: 80, top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 220, overflow: 'auto', background: 'white', border: '1px solid #ddd', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', padding: 8 }}>
            {options && options.length ? options.map(opt => (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <input type="checkbox" checked={(selected || []).indexOf(opt.value) >= 0} onChange={() => toggleVal(opt.value)} />
                <span style={{ marginLeft: 8 }}>{opt.label}</span>
              </label>
            )) : (
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

  // Confirmation modal state for event deletions
  const [confirmModal, setConfirmModal] = useState({ open: false, type: null, payload: null, working: false })

  async function performConfirmedDelete() {
    if (!confirmModal || !confirmModal.open) return
    const { type, payload } = confirmModal
    setConfirmModal(m => ({ ...m, working: true }))
    try {
      if (type === 'single') {
        const name = payload && payload.name
        if (!name) throw new Error('Missing event name')
        const res = await fetch(`/api/admin/events/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        showToast('success', `Event "${name}" deleted`)
      } else if (type === 'selected') {
        const names = payload && payload.names ? payload.names : []
        if (!names.length) throw new Error('No selected events')
        const res = await fetch(`/api/admin/events`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ names }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        showToast('success', `Deleted ${data.deleted || names.length} events`)
        setSelectedEvents([])
      } else if (type === 'all') {
        const res = await fetch('/api/admin/events?all=true', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Delete failed')
        showToast('success', 'All events deleted')
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

                <div className="row-actions">
                  <button className="btn-primary" type="submit" disabled={eventsLoading}>{eventsLoading ? 'Working...' : 'Create Event'}</button>
                </div>
              </form>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>Existing Events</h4>
                  <div>
                    <button className="btn-clear" onClick={loadEvents} style={{ marginRight: 8 }}>Refresh</button>
                    {/* Swapped: show Delete ALL here instead of Delete Selected */}
                    <button className="btn-danger" onClick={deleteAllEvents} style={{ marginLeft: 8 }} disabled={!(events && events.length)}>Delete ALL Events</button>
                  </div>
                </div>

                {eventsLoading ? (
                  <div className="empty-note">Loading events...</div>
                ) : events && events.length ? (
                  <table className="events-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev.name}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedEvents.includes(ev.name)}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...selectedEvents, ev.name]
                                  : selectedEvents.filter(x => x !== ev.name);
                                setSelectedEvents(next);
                              }}
                            />
                          </td>
                          <td>{ev.name}</td>
                          <td>{ev.description || '-'}</td>
                          <td>{ev.event_date || '-'}</td>
                          <td>{ev.created_at || '-'}</td>
                          <td>
                            <button className="delete-btn" onClick={() => deleteEvent(ev.name)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-note">No events defined.</div>
                )}

                <div style={{ marginTop: 10 }}>
                  {/* Moved Delete Selected here (swapped positions) */}
                  <button className="btn-danger" onClick={deleteSelectedEvents} disabled={!(selectedEvents && selectedEvents.length)}>Delete Selected</button>
                </div>
              </div>
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
          </section>

          <aside className="card right-card">
            <div className="db-inner">
              <div className="db-white-head"><h3>Database Management</h3></div>

              {/* Removed old "type DELETE" permanent purge UI; use filter-based deletes below */}
              <hr />

              <div className="db-range">
                <h4>Delete records by filters</h4>
                <p className="small">Choose any combination of Event, Status, From and To dates. At least one filter is required.</p>
                <form className="range-form" onSubmit={previewRange}>
                  <label className="range-field">
                    <MultiSelectDropdown
                      label="Event"
                      options={events.map(ev => ({ value: ev.name, label: ev.name + (ev.event_date ? ` (${ev.event_date})` : '') }))}
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
                    <button className="btn-danger-wide" type="submit" disabled={deletingRange || previewLoading}>{previewLoading ? 'Checking...' : (deletingRange ? 'Deleting...' : 'Preview & Delete')}</button>
                  </div>
                </form>
              </div>

              <div className="db-note">Matching records will be permanently deleted when you confirm in the preview.</div>
            </div>
          </aside>
        </div>
      </div>

      {/* Preview modal */}
      {showPreviewModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Preview: {previewCount} record(s) matched</h3>
            <p className="small">The following records match your filters {(filterEvent && filterEvent.length) ? `event="${filterEvent.join(', ')}"` : ''} {(filterLocation && filterLocation.length) ? `location="${filterLocation.join(', ')}"` : ''} {(filterStatus && filterStatus.length) ? `status="${filterStatus.join(', ')}"` : ''} {fromDate ? `from=${fromDate}` : ''} {toDate ? `to=${toDate}` : ''}.</p>
            <div className="preview-list">
              {previewRows && previewRows.length ? (
                <table className="preview-table">
                  <thead>
                    <tr><th>Token</th><th>Deposited At</th><th>Returned At</th></tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map(r => (
                      <tr key={r.id}>
                        <td>{r.token_number}</td>
                        <td>{r.deposited_at}</td>
                        <td>{r.returned_at || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-note">No records matched.</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-clear" onClick={() => setShowPreviewModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeleteRange} disabled={deletingRange}>{deletingRange ? 'Deleting...' : `Delete ${previewCount} records`}</button>
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
