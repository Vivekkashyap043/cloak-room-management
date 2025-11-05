const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public (authenticated) events list for users to select
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description, event_date, created_at FROM events ORDER BY created_at DESC');
    const out = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      event_date: r.event_date ? require('moment-timezone').tz(r.event_date, 'Asia/Kolkata').format('YYYY-MM-DD') : null,
      created_at: r.created_at ? require('moment-timezone').tz(r.created_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null
    }));
    res.json({ events: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
