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
router.post('/', authenticate, upload.fields([{ name: 'person_photo' }, { name: 'things_photo' }]), async (req, res) => {
  try {
    const { token_number, person_name, things_name, status } = req.body;
    if (!token_number || !person_name || !things_name || !status) return res.status(400).json({ message: 'Missing required fields' });
    // require uploaded files
    if (!req.files || !req.files['person_photo'] || !req.files['things_photo']) return res.status(400).json({ message: 'Both person_photo and things_photo are required' });
    // prevent duplicate active token (status = 'submitted')
    const [ex] = await pool.query("SELECT id FROM records WHERE token_number = ? AND status = 'submitted' LIMIT 1", [token_number]);
    if (ex.length) return res.status(400).json({ message: 'Token number already in use' });

    const person_photo_path = '/uploads/' + req.files['person_photo'][0].filename;
    const things_photo_path = '/uploads/' + req.files['things_photo'][0].filename;
    const now = new Date();
    // insert submitted_at to match schema
    await pool.query('INSERT INTO records (token_number, person_name, person_photo_path, things_name, things_photo_path, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [token_number, person_name, person_photo_path, things_name, things_photo_path, status, now]);
    res.json({ message: 'record created' });
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
  const [rows] = await pool.query("SELECT * FROM records WHERE token_number = ? AND status = 'submitted' LIMIT 1", [token]);
    console.log("Record", rows);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// get by person name (may return many)
router.get('/person/:name', authenticate, async (req, res) => {
  try {
    const name = req.params.name;
    console.log("Name: ", name);
  const [rows] = await pool.query("SELECT * FROM records WHERE person_name LIKE ? AND status = 'submitted'", ['%' + name + '%']);
    console.log("returned rows", rows);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// exit -> mark record as Returned and set exited_at
router.post('/exit/:token', authenticate, async (req, res) => {
  try {
    const token = req.params.token;
    const now = new Date();
  const [result] = await pool.query("UPDATE records SET status = 'returned', returned_at = ? WHERE token_number = ? AND status = 'submitted'", [now, token]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Record not found or already returned' });
    res.json({ message: 'record marked as returned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
