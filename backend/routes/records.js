const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
// previously exported records to Excel and used backup tables.
// That archival/export functionality has been removed per new requirements.
const moment = require('moment-timezone');

const router = express.Router();

// setup multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext);
  }
});
// Allow slightly larger uploads on the server side (client will compress when possible)
const upload = multer({ 
  storage,
  // increase limit to 5MB to accommodate larger camera images that we compress client-side
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed'))
  }
});

// create record (entry)
// New flow: person_name removed. Items are sent as JSON in `items` field (array of { name, count }).
// Support optional per-item photo uploads submitted as multiple files under field name 'item_photos'
router.post('/', authenticate, upload.fields([{ name: 'person_photo', maxCount: 1 }, { name: 'item_photos', maxCount: 50 }]), async (req, res) => {
  try {
    const { token_number, status, event_name } = req.body;
    let items = [];
    try { items = req.body.items ? JSON.parse(req.body.items) : []; } catch (e) { items = []; }
  if (!token_number || !status || !event_name) return res.status(400).json({ message: 'Missing required fields: token_number, status and event_name' });

  // determine location from authenticated user (auto-filled)
  const userLocation = (req.user && req.user.location) ? req.user.location : (req.body.location || null);
  // if location couldn't be determined, reject to avoid accidental cross-location inserts
  if (!userLocation) return res.status(403).json({ message: 'Unauthorized: missing user location' });

  // Use a transaction and SELECT ... FOR UPDATE to avoid race conditions where two
  // concurrent requests could both pass the duplicate check and insert the same
  // token+location+event. We enforce that there must not be an existing record
  // with status='deposited' at the same location+event.
  const person_photo_path = (req.files && req.files['person_photo'] && req.files['person_photo'][0]) ? '/uploads/' + req.files['person_photo'][0].filename : null;
  const itemFiles = (req.files && req.files['item_photos']) ? req.files['item_photos'] : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // lock matching rows (if any) for this token+location
    const [ex] = await conn.query("SELECT id FROM records WHERE token_number = ? AND status = 'deposited' AND location = ? AND event_name = ? LIMIT 1 FOR UPDATE", [token_number, userLocation, event_name]);
    if (ex.length) {
      await conn.rollback();
      conn.release();
      return res.status(409).json({ message: 'Token is already issued' });
    }

  // use IST timestamps for stored datetimes
  const now = moment.tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    let ins;
    try {
      // ensure the provided event exists (avoid typo causing null event_name)
      const [ev] = await conn.query('SELECT id FROM events WHERE name = ? LIMIT 1', [event_name]);
      if (!ev.length) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ message: 'Invalid event_name' });
      }

      const r = await conn.query('INSERT INTO records (token_number, location, event_name, person_photo_path, status, deposited_at) VALUES (?, ?, ?, ?, ?, ?)',
        [token_number, userLocation, event_name, person_photo_path, status, now]);
      ins = r[0];
    } catch (insertErr) {
      // handle unique constraint violation on (token_number, location, event_name)
      if (insertErr && (insertErr.code === 'ER_DUP_ENTRY' || insertErr.errno === 1062)) {
        try { await conn.rollback(); } catch (e) {}
        try { conn.release(); } catch (e) {}
        return res.status(409).json({ message: 'Token is already issued' });
      }
      throw insertErr;
    }

    const recordId = ins.insertId;

    // insert items rows if provided
    if (items && items.length) {
      const itemInserts = items.map((it, idx) => {
        const file = itemFiles[idx];
        const photoPath = it.item_photo_path || it.photo_path || (file ? '/uploads/' + file.filename : null);
        return [recordId, it.name, it.count || 1, photoPath];
      });
      await conn.query('INSERT INTO items (record_id, item_name, item_count, item_photo_path) VALUES ?', [itemInserts]);
    }

    await conn.commit();
    conn.release();
    res.json({ message: 'record created', recordId });
  } catch (txErr) {
    try { await conn.rollback(); } catch (e) {}
    try { conn.release(); } catch (e) {}
    console.error(txErr);
    return res.status(500).json({ message: 'Server error' });
  }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// get by token_number
router.get('/token/:token', authenticate, async (req, res) => {
  try {
    const token = req.params.token;
    console.log("Token ", token);
    // enforce location matching: only return records for the authenticated user's location
    const userLocation = (req.user && req.user.location) ? req.user.location : null;
    if (!userLocation) return res.status(403).json({ message: 'Unauthorized: missing user location' });
    const event_name = req.query.event;
    if (!event_name) return res.status(400).json({ message: 'Missing event query parameter' });
    // Return the most recent record for the given token/event/location.
    // Allow admin users (token with role: 'admin') to bypass the location
    // requirement so admins can look up records across locations. Regular
    // users must have a location in their token and will only see records for
    // that location.
    const isAdmin = req.user && req.user.role === 'admin';
    if (!userLocation && !isAdmin) return res.status(403).json({ message: 'Unauthorized: missing user location' });

    // Build SQL dynamically depending on whether we have a userLocation
    // (regular user) or not (admin - no location filter).
    let sql = "SELECT r.*, i.id as item_id, i.item_name, i.item_count, i.item_photo_path as item_photo_path FROM records r LEFT JOIN items i ON i.record_id = r.id WHERE r.token_number = ? AND r.event_name = ?";
    const params = [token, event_name];
    if (userLocation) {
      sql += ' AND r.location = ?';
      params.push(userLocation);
    }
    sql += ' ORDER BY r.deposited_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Not found' });
    // rows may contain duplicated record rows if multiple items; normalize into single record with items array
    const recordRow = rows[0];
    const record = {
      id: recordRow.id,
      token_number: recordRow.token_number,
      location: recordRow.location,
      person_photo_path: recordRow.person_photo_path,
      status: recordRow.status,
      deposited_at: recordRow.deposited_at ? moment.tz(recordRow.deposited_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null,
      returned_at: recordRow.returned_at ? moment.tz(recordRow.returned_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null,
      items: []
    };
    for (const r of rows) {
      if (r.item_id) record.items.push({ id: r.item_id, item_name: r.item_name, item_count: r.item_count, item_photo_path: r.item_photo_path || null });
    }
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// NOTE: person-name based lookup removed (person_name no longer stored)

// exit -> mark record as Returned and set exited_at
router.post('/exit/:token', authenticate, async (req, res) => {
  try {
    const token = req.params.token;
    // now timestamp
  const now = moment.tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    // only act on today's deposited records at the user's location
    const userLocation = (req.user && req.user.location) ? req.user.location : null;
    if (!userLocation) return res.status(403).json({ message: 'Unauthorized: missing user location' });
    const { event_name } = req.body || {};
    if (!event_name) return res.status(400).json({ message: 'Missing event_name in request body' });

    // Find the deposited record for today
  // use IST day-range when searching for today's deposited record
  const istDateExit = moment.tz('Asia/Kolkata').format('YYYY-MM-DD');
  const fromTsExit = `${istDateExit} 00:00:00`;
  const toTsExit = `${istDateExit} 23:59:59`;
  const [rows] = await pool.query("SELECT * FROM records WHERE token_number = ? AND status = 'deposited' AND location = ? AND event_name = ? AND deposited_at BETWEEN ? AND ? LIMIT 1", [token, userLocation, event_name, fromTsExit, toTsExit]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Record not found or already returned' });
    const record = rows[0];

    // Mark the record as returned. We will keep files on disk (no archival).
  await pool.query('UPDATE records SET status = ?, returned_at = ? WHERE id = ?', ['returned', now, record.id]);
    return res.json({ message: 'record returned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
