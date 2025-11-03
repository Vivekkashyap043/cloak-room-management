import React, { useState, useEffect } from "react";
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
  const [creating, setCreating] = useState(false);

  // user search/delete
  const [query, setQuery] = useState("");
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  // database deletion controls
  const [confirm, setConfirm] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
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

  // Permanent purge preview state
  const [permPreviewLoading, setPermPreviewLoading] = useState(false);
  const [permPreviewRows, setPermPreviewRows] = useState([]);
  const [permPreviewCount, setPermPreviewCount] = useState(0);
  const [showPermPreviewModal, setShowPermPreviewModal] = useState(false);

  // Range preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  async function createUser(e) {
    e?.preventDefault();
    if (!newUser.trim() || !newPass) return showToast("error", "Provide username & password.");
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ username: newUser.trim(), password: newPass }),
      });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || "Failed");
      showToast("success", `User "${(data && data.username) || newUser}" created`);
      setNewUser(""); setNewPass("");
    } catch (err) {
      showToast("error", err.message || "Server error");
    } finally { setCreating(false); }
  }

  async function searchUser(e) {
    e?.preventDefault();
    if (!query.trim()) return showToast("info", "Enter username or email to search.");
    setSearching(true); setFound(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(query.trim())}`, { headers: { Authorization: "Bearer " + token } });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) showToast("error", (data && data.message) || res.statusText || "Not found");
      else if (!data.user) showToast("info", "User not found");
      else setFound(data.user);
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
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || "Delete failed");
      showToast("success", `User "${found.username}" deleted`);
      setFound(null); setQuery("");
    } catch (err) { showToast("error", err.message || "Server error"); }
    finally { setDeletingUser(false); }
  }

  async function previewPermanent(e) {
    e?.preventDefault();
    if (confirm !== "DELETE") return showToast("error", 'Type "DELETE" to confirm');
    setPermPreviewLoading(true); setPermPreviewRows([]); setPermPreviewCount(0);
    try {
      const res = await fetch(`/api/admin/records/preview-permanent`, { headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Preview failed');
      setPermPreviewRows(data.rows || []);
      setPermPreviewCount(data.count || (data.rows && data.rows.length) || 0);
      setShowPermPreviewModal(true);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setPermPreviewLoading(false); }
  }

  async function confirmDeletePermanent() {
    if (confirm !== "DELETE") return showToast("error", 'Type "DELETE" to confirm');
    setDeletingAll(true);
    try {
      const res = await fetch(`/api/admin/records/permanent`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Delete failed');
      showToast('success', `Purged ${data.deletedRows || 0} records`);
      setConfirm(''); setShowPermPreviewModal(false); setPermPreviewRows([]); setPermPreviewCount(0);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setDeletingAll(false); }
  }

  async function previewRange(e) {
    e?.preventDefault();
    if (!fromDate || !toDate) return showToast('error', 'Select both From and To dates');
    setPreviewLoading(true); setPreviewRows([]); setPreviewCount(0);
    try {
      const q = `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
      const res = await fetch(`/api/admin/records/preview-delete${q}`, { headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Preview failed');
      setPreviewRows(data.rows || []);
      setPreviewCount(data.count || (data.rows && data.rows.length) || 0);
      setShowPreviewModal(true);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setPreviewLoading(false); }
  }

  async function confirmDeleteRange() {
    if (!fromDate || !toDate) return showToast('error', 'Date range missing');
    setDeletingRange(true);
    try {
      const q = `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
      const res = await fetch(`/api/admin/records/delete-range${q}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      let data = {};
      try { data = await res.json(); } catch (err) {}
      if (!res.ok) throw new Error((data && data.message) || res.statusText || 'Delete failed');
      showToast('success', `Deleted ${data.deletedRows || 0} record(s)`);
      setFromDate(''); setToDate(''); setShowPreviewModal(false); setPreviewRows([]); setPreviewCount(0);
    } catch (err) { showToast('error', err.message || 'Server error'); }
    finally { setDeletingRange(false); }
  }

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
                <div className="row-actions">
                  <button className="btn-primary" type="submit" disabled={creating}>{creating ? "Creating..." : "Add User"}</button>
                </div>
              </form>
            </div>

            <hr className="divider" />

            <div className="panel">
              <h3 className="panel-title">Delete User</h3>
              <form className="search-form" onSubmit={searchUser}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter username or email" />
                <button className="btn-search" type="submit" disabled={searching}>{searching ? "Searching..." : "Search"}</button>
              </form>

              {found ? (
                <div className="found-box">
                  <div className="found-header">
                    <div className="found-left">
                      <div className="avatar">{(found.username||"U").charAt(0).toUpperCase()}</div>
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
                <div className="empty-note">Search a username to view details.</div>
              )}

            </div>
          </section>

          <aside className="card right-card">
            <div className="db-inner">
              <div className="db-white-head"><h3>Database Management</h3></div>
              <p className="db-desc">Permanently delete all records or delete records by submitted date range. Both actions are irreversible.</p>

              <form className="db-confirm" onSubmit={previewPermanent}>
                <input className="confirm-input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder='Type "DELETE" to confirm' />
                <button className="btn-danger-wide" type="submit" disabled={deletingAll || permPreviewLoading}>{permPreviewLoading ? 'Checking...' : (deletingAll ? 'Working...' : 'Preview & Delete All')}</button>
              </form>

              <hr />

              <div className="db-range">
                <h4>Delete records by submitted date</h4>
                <p className="small">Select the date range to delete records.</p>
                <form className="range-form" onSubmit={previewRange}>
                  <label className="range-field">
                    <div>From</div>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  </label>
                  <label className="range-field">
                    <div>To</div>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                  </label>
                  <div className="range-actions" style={{marginTop: 10}}>
                    <button className="btn-danger-wide" type="submit" disabled={deletingRange || previewLoading}>{previewLoading ? 'Checking...' : (deletingRange ? 'Deleting...' : 'Preview & Delete')}</button>
                  </div>
                </form>
              </div>

              <div className="db-note">All records will be permanently deleted.</div>
            </div>
          </aside>
        </div>
      </div>

      {/* Preview modal */}
      {showPreviewModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Preview: {previewCount} record(s) matched</h3>
            <p className="small">The following records have <code>status = 'returned'</code> and <code>submitted_at</code> within {fromDate} - {toDate}.</p>
            <div className="preview-list">
              {previewRows && previewRows.length ? (
                <table className="preview-table">
                  <thead>
                    <tr><th>Token</th><th>Person</th><th>Submitted At</th><th>Returned At</th></tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map(r => (
                      <tr key={r.id}>
                        <td>{r.token_number}</td>
                        <td>{r.person_name}</td>
                        <td>{r.submitted_at}</td>
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

      {/* Permanent purge preview modal */}
      {showPermPreviewModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Preview: {permPreviewCount} record(s) marked soft-deleted</h3>
            <p className="small">The following records have <code>status = 'returned'</code> and will be permanently removed if you confirm.</p>
            <div className="preview-list">
              {permPreviewRows && permPreviewRows.length ? (
                <table className="preview-table">
                  <thead>
                    <tr><th>Token</th><th>Person</th><th>Submitted At</th><th>Returned At</th></tr>
                  </thead>
                  <tbody>
                    {permPreviewRows.slice(0, 50).map(r => (
                      <tr key={r.id}>
                        <td>{r.token_number}</td>
                        <td>{r.person_name}</td>
                        <td>{r.submitted_at}</td>
                        <td>{r.returned_at || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-note">No soft-deleted records found.</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-clear" onClick={() => setShowPermPreviewModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeletePermanent} disabled={deletingAll}>{deletingAll ? 'Deleting...' : `Delete ${permPreviewCount} records`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
