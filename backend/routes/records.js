const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

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
    const { token_number, status } = req.body;
    let items = [];
    try { items = req.body.items ? JSON.parse(req.body.items) : []; } catch (e) { items = []; }

  if (!token_number || !status) return res.status(400).json({ message: 'Missing required fields: token_number and status' });

  // determine location from authenticated user (auto-filled)
  const userLocation = (req.user && req.user.location) ? req.user.location : (req.body.location || null);
  // if location couldn't be determined, reject to avoid accidental cross-location inserts
  if (!userLocation) return res.status(403).json({ message: 'Unauthorized: missing user location' });

  // prevent duplicate active token (status = 'deposited') at the same location
  const [ex] = await pool.query("SELECT id FROM records WHERE token_number = ? AND status = 'deposited' AND location = ? LIMIT 1", [token_number, userLocation]);
  if (ex.length) return res.status(409).json({ message: 'Token is already issued' });

  const person_photo_path = (req.files && req.files['person_photo'] && req.files['person_photo'][0]) ? '/uploads/' + req.files['person_photo'][0].filename : null;
  const itemFiles = (req.files && req.files['item_photos']) ? req.files['item_photos'] : [];

    const now = new Date();
    // Insert record without things_name (items are stored in items table). deposited_at stores the entry timestamp.
    const [ins] = await pool.query('INSERT INTO records (token_number, location, person_photo_path, status, deposited_at) VALUES (?, ?, ?, ?, ?)',
      [token_number, userLocation, person_photo_path, status, now]);

    const recordId = ins.insertId;

    // insert items rows if provided
    if (items && items.length) {
      // Map item files to items by order: frontend should append item_photos in same order as the items array
      const itemInserts = items.map((it, idx) => {
        const file = itemFiles[idx];
        // prefer explicit item_photo_path in items JSON, else map file by order
        const photoPath = it.item_photo_path || it.photo_path || (file ? '/uploads/' + file.filename : null);
        return [recordId, it.name, it.count || 1, photoPath];
      });
      await pool.query('INSERT INTO items (record_id, item_name, item_count, item_photo_path) VALUES ?', [itemInserts]);
    }

    res.json({ message: 'record created', recordId });
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
    const [rows] = await pool.query(
      "SELECT r.*, i.id as item_id, i.item_name, i.item_count, i.item_photo_path as item_photo_path FROM records r LEFT JOIN items i ON i.record_id = r.id WHERE r.token_number = ? AND r.location = ? LIMIT 100",
      [token, userLocation]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Not found' });
    // rows may contain duplicated record rows if multiple items; normalize into single record with items array
    const recordRow = rows[0];
    const record = {
      id: recordRow.id,
      token_number: recordRow.token_number,
      location: recordRow.location,
  person_photo_path: recordRow.person_photo_path,
      status: recordRow.status,
      deposited_at: recordRow.deposited_at,
      returned_at: recordRow.returned_at,
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
    const now = new Date();
  // only mark deposited records at the same location as returned
  const userLocation = (req.user && req.user.location) ? req.user.location : null;
  if (!userLocation) return res.status(403).json({ message: 'Unauthorized: missing user location' });
  const [result] = await pool.query("UPDATE records SET status = 'returned', returned_at = ? WHERE token_number = ? AND status = 'deposited' AND location = ?", [now, token, userLocation]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found or already returned' });
    res.json({ message: 'record marked as returned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
