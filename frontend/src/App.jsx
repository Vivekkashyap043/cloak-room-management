// App.css removed; component and global styles are imported elsewhere
import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import AdminEvents from './pages/AdminEvents'
import AdminReport from './pages/AdminReport'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  const [role, setRole] = useState(localStorage.getItem('role') || null)
  const [username, setUsername] = useState(localStorage.getItem('username') || null)
  const [location, setLocation] = useState(localStorage.getItem('location') || null)

  // verify token on app start — if invalid, clear stored auth so Login is shown
  useEffect(() => {
    async function verify() {
      const t = localStorage.getItem('token')
      if (!t) return
      try {
        const res = await fetch(`/api/auth/me`, {
          headers: { Authorization: 'Bearer ' + t }
        })
        if (!res.ok) {
          // Only clear stored auth if token is invalid (401). For other errors keep token so transient server issues
          if (res.status === 401) {
            throw new Error('invalid')
          } else {
            console.warn('Auth verify returned non-OK', res.status)
            const data = await res.json().catch(() => ({}))
            const payload = data.user || {}
            setRole(localStorage.getItem('role') || payload.role || 'user')
            setUsername(localStorage.getItem('username') || payload.username || null)
            setToken(t)
            return
          }
        }
        const data = await res.json()
        // keep role/username from stored values or payload
        const payload = data.user || {}
        setRole(localStorage.getItem('role') || payload.role || 'user')
        setUsername(localStorage.getItem('username') || payload.username || null)
        setToken(t)
      } catch (err) {
        // invalid token — clear
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        localStorage.removeItem('username')
        setToken(null)
        setRole(null)
        setUsername(null)
      }
    }
    verify()
  }, [])

  function handleLogin(tokenVal, roleVal, usernameVal, locationVal) {
    localStorage.setItem('token', tokenVal)
    localStorage.setItem('role', roleVal)
    localStorage.setItem('username', usernameVal || '')
    if (locationVal) localStorage.setItem('location', locationVal)
    setToken(tokenVal)
    setRole(roleVal)
    setUsername(usernameVal)
    setLocation(locationVal || null)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('username')
    localStorage.removeItem('location')
    setToken(null)
    setRole(null)
    setUsername(null)
    setLocation(null)
  }



  // Use react-router for navigation.
  return (
    <Router>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route
            path="/admin"
            element={token && role === 'admin' ? (
              <AdminDashboard token={token} username={username} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          />
          <Route
            path="/admin/events"
            element={token && role === 'admin' ? (
              <AdminEvents token={token} username={username} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          />

          <Route
            path="/admin/report"
            element={token && role === 'admin' ? (
              <AdminReport token={token} username={username} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          />

          <Route
            path="/dashboard"
            element={token ? (
              <Dashboard token={token} role={role} username={username} location={location} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          />

          <Route
            path="/"
            element={<Navigate to={token ? (role === 'admin' ? '/admin' : '/dashboard') : '/login'} replace />}
          />
        </Routes>
      </Router>
  )
}

export default App
