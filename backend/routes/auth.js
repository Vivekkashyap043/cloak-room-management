const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();
const secret = process.env.JWT_SECRET || 'devsecret';

// login: check admin env credentials first, then DB users
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username and password required' });

    // check admin from env
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ username, role: 'admin' }, secret, { expiresIn: '8h' });
      return res.json({ token, role: 'admin', username });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const tokenPayload = { username: user.username, role: user.role || 'user' };
  if (user.location) tokenPayload.location = user.location;
  const token = jwt.sign(tokenPayload, secret, { expiresIn: '8h' });
  res.json({ token, role: user.role || 'user', username: user.username, location: user.location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// validate token and return user info
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing authorization header' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid authorization header' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, secret);
    return res.json({ ok: true, user: payload });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;

