import React, { useState } from 'react'
import './AdminPanel.css'

export default function AdminPanel({ token }) {
  // Use relative API paths; remove env indirection
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [deleteUsername, setDeleteUsername] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  // toasts removed — use inline messages via setMessage

  async function addUser(e) {
    // can be invoked by button click (no event) or form submit
    if (e && e.preventDefault) e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      if (!username || !password) return setMessage('username and password required')
  const res = await fetch(`/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Failed')
      setMessage('User added')
      setUsername('')
      setPassword('')
    } catch (err) {
      setMessage('Server error')
    } finally {
      setLoading(false)
    }
  }

  async function deleteUser(name) {
  if (!name) return setMessage('Enter a username to delete')
    setMessage('')
    setLoading(true)
    try {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      })
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Failed')
      setMessage('User deleted')
      setDeleteUsername('')
      setSearchResult(null)
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function searchUser() {
    if (!deleteUsername) return setMessage('Enter a username to search')
    setLoading(true)
    setSearchResult(null)
    setNotFound(false)
    try {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(deleteUsername)}`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (res.status === 404) {
        setNotFound(true)
        setMessage('User not found')
        return
      }
      const data = await res.json()
      if (!res.ok) return setMessage(data.message || 'Search failed')
      setSearchResult(data.user)
      setNotFound(false)
      setMessage('User found')
    } catch (err) {
      setMessage('Server error')
    } finally { setLoading(false) }
  }

  async function purge() {
    // purge removed from left panel; database purge is handled in the Database Management card
  }

  return (
    <div className="admin-card card">
      <h2>Admin Panel</h2>

      <div className="add-user-row">
        <label className="small">Add New User</label>
        <div className="inline-row">
          <input className="large-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <input className="large-input" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: 160 }} />
          <button onClick={addUser} style={{color: "white"}} className="primary small" disabled={loading || !username || !password}>{loading ? 'Adding...' : 'Add User'}</button>
        </div>
      </div>

      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid #eef2f6' }} />

      <div className="delete-user">
        <label className="small">Delete User</label>
        <div className="inline-row">
          <input className="large-input" placeholder="Enter Username to Search" value={deleteUsername} onChange={e => setDeleteUsername(e.target.value)} />
          <button className="ghost" onClick={searchUser} style={{ marginLeft: 8 }} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        </div>

        <div style={{ height: 12 }} />

        <div className="delete-found-row">
          {searchResult ? (
            <>
              <div className="found">User found: <strong>{searchResult.username}</strong></div>
              <button className="ghost danger" onClick={() => deleteUser(searchResult.username)} disabled={loading}>{loading ? 'Working...' : 'Delete User'}</button>
            </>
          ) : notFound ? (
            <div className="found not-found">User not found</div>
          ) : (
            <div className="found">No user selected</div>
          )}
        </div>
      </div>

      {message && <div className="message">{message}</div>}
    </div>
  )
}
