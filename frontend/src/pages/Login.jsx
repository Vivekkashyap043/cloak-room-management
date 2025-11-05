import React, { useState } from 'react'
import './Login.css'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function Login({ onLogin }) {
    // Use relative paths (/api) so dev proxy or same-origin works; remove env indirection
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const navigate = useNavigate()

    async function submit(e) {
        e.preventDefault()
        setError('')
        try {
            const res = await fetch(`/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            const data = await res.json()
            if (!res.ok) return setError(data.message || 'Login failed')
            // persist username as well
            onLogin(data.token, data.role, data.username)
            // navigate to the appropriate area
            // pass location (if present) to the app so dashboards can display it
            onLogin(data.token, data.role, data.username, data.location)
            if (data.role === 'admin') navigate('/admin')
            else navigate('/dashboard')
        } catch (err) {
            setError('Server error')
        }
    }

    return (
        <div className="login-container ">
            <form className="login-form" onSubmit={submit}>

                <div className="logo">
                    <img src={logo} alt="Logo" className="logo-img" />
                </div>

                {error && <div className="error" role="alert">{error}</div>}

                <label htmlFor="username">Username</label>
                <input id="username" name="username" className="login-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />

                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" className="login-input" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />

                <button type="submit" className="loginbtn">Login</button>
            </form>
        </div>
    )
}
