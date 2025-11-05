const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public (authenticated) events list for users to select
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    const wantAll = req.query && req.query.all === 'true';
    const allForUser = req.query && req.query.allForUser === 'true';
    // By default, only show active events. Admins can request all via ?all=true.
    // Additionally, clients can request all events for the current user's location via ?allForUser=true.
    let sql = 'SELECT id, name, description, event_date, event_status, event_incharge, incharge_phone, event_location, created_at FROM events';
    const params = [];
    // Determine whether to filter by status
    const filterByStatus = !(isAdmin && wantAll) && !allForUser;
    if (filterByStatus) {
      // filter to active events
      sql += ' WHERE event_status = ?';
      params.push('active');
      // if user has a location, only return events for that location
      if (req.user && req.user.location) {
        sql += ' AND event_location = ?';
        params.push(req.user.location);
      }
    } else {
      // not filtering by status; however if allForUser is requested and user has a location,
      // limit results to the user's location so users don't see other locations' events
      if (allForUser && req.user && req.user.location) {
        sql += ' WHERE event_location = ?';
        params.push(req.user.location);
      }
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, params);
    const out = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      event_date: r.event_date ? require('moment-timezone').tz(r.event_date, 'Asia/Kolkata').format('YYYY-MM-DD') : null,
      event_status: r.event_status || 'active',
      event_incharge: r.event_incharge || null,
      incharge_phone: r.incharge_phone || null,
      event_location: r.event_location || null,
      created_at: r.created_at ? require('moment-timezone').tz(r.created_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null
    }));
    res.json({ events: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Allow authenticated users (not just admins) to create events.
// Admins may specify event_location; regular users are constrained to their own location.
// POST /api/events
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, event_date, event_incharge, incharge_phone, event_location, event_status } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Event name required' });
    if (!event_date) return res.status(400).json({ message: 'Event date required (YYYY-MM-DD)' });
    if (!event_incharge) return res.status(400).json({ message: 'Event in-charge name required' });
    if (!incharge_phone) return res.status(400).json({ message: 'Event in-charge phone required' });
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(event_date)) return res.status(400).json({ message: 'Invalid event_date format; use YYYY-MM-DD' });

    // Determine location: admins may pass event_location; regular users use their account location
    let loc = 'gents location';
    const allowed = ['gents location', 'ladies location'];
    if (req.user && req.user.role === 'admin') {
      loc = event_location && allowed.includes(event_location) ? event_location : 'gents location';
    } else {
      // require that user has a location assigned
      loc = (req.user && req.user.location) ? req.user.location : 'gents location';
    }

    const status = event_status && ['active','inactive'].includes(event_status) ? event_status : 'active';

    // uniqueness per location
    const [ex] = await pool.query('SELECT id FROM events WHERE name = ? AND event_location = ? LIMIT 1', [name, loc]);
    if (ex.length) return res.status(400).json({ message: 'Event already exists at this location' });

    // If new event will be active, ensure there is no other active event at same location
    if (status === 'active') {
      const [act] = await pool.query('SELECT id FROM events WHERE event_status = ? AND event_location = ? LIMIT 1', ['active', loc]);
      if (act.length) return res.status(409).json({ message: 'An event at that location already is active' });
    }

    const [ins] = await pool.query('INSERT INTO events (name, description, event_date, event_status, event_incharge, incharge_phone, event_location) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, description || null, event_date, status, event_incharge || null, incharge_phone || null, loc]);
    res.json({ message: 'event created', id: ins.insertId, name, event_date, event_status: status, event_location: loc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Allow authenticated users (not just admins) to update event attributes (e.g., set inactive)
// PATCH /api/events/:id
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const { event_status } = req.body || {};
    if (!event_status || !['active','inactive'].includes(event_status)) return res.status(400).json({ message: 'Provide event_status as "active" or "inactive"' });

    // find event first
    const [evs] = await pool.query('SELECT id, event_location FROM events WHERE id = ? LIMIT 1', [id]);
    if (!evs.length) return res.status(404).json({ message: 'Event not found' });
    const ev = evs[0];

    // permission: admin can update any; regular users can update only events at their location
    if (!(req.user && req.user.role === 'admin')) {
      const userLoc = req.user && req.user.location ? req.user.location : null;
      if (!userLoc || String(userLoc).toLowerCase() !== String(ev.event_location).toLowerCase()) {
        return res.status(403).json({ message: 'Forbidden: cannot modify event outside your location' });
      }
    }

    // If setting to active, ensure no other active event exists at same location
    if (event_status === 'active') {
      const [act] = await pool.query('SELECT id FROM events WHERE event_status = ? AND event_location = ? AND id <> ? LIMIT 1', ['active', ev.event_location, id]);
      if (act.length) return res.status(409).json({ message: 'An event at that location already is active' });
    }

    const [upd] = await pool.query('UPDATE events SET event_status = ? WHERE id = ?', [event_status, id]);
    if (upd.affectedRows === 0) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'event updated', id, event_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
