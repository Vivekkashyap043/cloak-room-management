const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// add user (admin only)
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, location } = req.body;
    if (!username || !password || !location) return res.status(400).json({ message: 'username, password and location required' });
    const allowed = ['gents location', 'ladies location'];
    if (!allowed.includes(location)) return res.status(400).json({ message: 'invalid location' });
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (exists.length) return res.status(400).json({ message: 'username already exists' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash, role, location) VALUES (?, ?, ?, ?)', [username, hash, 'user', location]);
    res.json({ message: 'user created', username, location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete user by username (admin only)
router.delete('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username;
    // find user to get location
    const [rows] = await pool.query('SELECT id, username, location FROM users WHERE username = ? LIMIT 1', [username]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];

    // Begin deleting returned records for this user's location and unlink files
    const userLocation = user.location;
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // select record ids and person photos
      const [records] = await conn.query('SELECT id, person_photo_path FROM records WHERE status = ? AND location = ? FOR UPDATE', ['returned', userLocation]);
      const ids = records.map(r => r.id);

      // gather item photo paths for these records
      let itemPhotos = [];
      if (ids.length) {
        const [items] = await conn.query('SELECT id, record_id, item_photo_path FROM items WHERE record_id IN (?)', [ids]);
        itemPhotos = items.map(it => ({ record_id: it.record_id, path: it.item_photo_path }));
      }

      // helper to unlink a file path safely
      async function tryUnlink(p) {
        if (!p) return { path: p, success: false, reason: 'no_path' };
        try {
          const rel = p.replace(/^[/\\]+/, '');
          const full = path.join(__dirname, '..', rel);
          await fs.promises.unlink(full);
          return { path: p, success: true };
        } catch (err) {
          return { path: p, success: false, reason: err && err.code ? err.code : String(err) };
        }
      }

      const perRecord = [];
      for (const r of records) {
        const personUnlink = await tryUnlink(r.person_photo_path);
        const itemsForRec = itemPhotos.filter(ip => ip.record_id === r.id).map(x => x.path);
        const itemsUnlink = [];
        for (const p of itemsForRec) itemsUnlink.push(await tryUnlink(p));
        perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: personUnlink, item_unlink: itemsUnlink });
      }

      // delete records (items table has ON DELETE CASCADE)
      let delResult = { affectedRows: 0 };
      if (ids.length) {
        const [delRes] = await conn.query('DELETE FROM records WHERE id IN (?)', [ids]);
        delResult = delRes;
      }

      // finally delete the user
      await conn.query('DELETE FROM users WHERE id = ?', [user.id]);

      await conn.commit();

      // audit log
      try {
        const logsDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logsDir, 'audit.log');
        const entry = {
          timestamp: new Date().toISOString(),
          admin: req.user && req.user.username ? req.user.username : 'unknown',
          action: 'delete_user_and_returned_records',
          deletedUser: username,
          deletedRecords: delResult.affectedRows || 0,
          perRecord,
          ip: req.ip || req.headers['x-forwarded-for'] || null,
        };
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch (logErr) { console.error('Failed to write audit log', logErr); }

      return res.json({ message: 'user and returned records deleted', deletedRecords: delResult.affectedRows });
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.error(err);
      return res.status(500).json({ message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// get user by username (admin only) - for search
router.get('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username;
    const [rows] = await pool.query('SELECT id, username, role, location, created_at FROM users WHERE username = ? LIMIT 1', [username]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// permanently delete records that are soft-deleted (admin only)
router.delete('/records/permanent', authenticate, requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

  // select rows to delete (lock them) and gather file paths (person and item photos)
  const [rows] = await conn.query("SELECT id, person_photo_path FROM records WHERE status = 'returned' FOR UPDATE");
  const ids = rows.map(r => r.id);

  // gather item photo paths for these record ids
  let itemPhotos = [];
  if (ids.length) {
    const [items] = await conn.query('SELECT id, record_id, item_photo_path FROM items WHERE record_id IN (?)', [ids]);
    itemPhotos = items.map(it => ({ record_id: it.record_id, path: it.item_photo_path }));
  }

  async function tryUnlinkStatus(p) {
    if (!p) return { path: p, success: false, reason: 'no_path' };
    try {
      const rel = p.replace(/^[/\\]+/, '');
      const full = path.join(__dirname, '..', rel);
      await fs.promises.unlink(full);
      return { path: p, success: true };
    } catch (err) {
      return { path: p, success: false, reason: err && err.code ? err.code : String(err) };
    }
  }

  const perRecord = [];
  for (const r of rows) {
    const person = await tryUnlinkStatus(r.person_photo_path);
    const itemsForRec = itemPhotos.filter(ip => ip.record_id === r.id).map(x => x.path);
    const itemsUnlink = [];
    for (const p of itemsForRec) itemsUnlink.push(await tryUnlinkStatus(p));
    perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: person, item_unlink: itemsUnlink });
  }

  // perform DB delete using ids to ensure we only delete selected rows
  let result = { affectedRows: 0 };
  if (ids.length) {
    const [delRes] = await conn.query('DELETE FROM records WHERE id IN (?)', [ids]);
    result = delRes;
  }

    await conn.commit();

    // Audit log entry for permanent purge with per-file statuses
    try {
      const logsDir = path.join(__dirname, '..', 'logs');
      const logFile = path.join(logsDir, 'audit.log');
      const entry = {
        timestamp: new Date().toISOString(),
        admin: req.user && req.user.username ? req.user.username : 'unknown',
        action: 'delete_permanent_soft_deleted',
        deletedRows: result.affectedRows || 0,
        perRecord,
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      };
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (logErr) {
      console.error('Failed to write audit log', logErr);
    }

    res.json({ deletedRows: result.affectedRows });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// preview soft-deleted records that would be permanently removed
// GET /api/admin/records/preview-permanent
router.get('/records/preview-permanent', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, token_number, location, deposited_at, returned_at FROM records WHERE status = 'returned' ORDER BY deposited_at DESC LIMIT 1000"
    );
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// preview records that would be deleted for a given deposited_at date range where status = 'returned'
// GET /api/admin/records/preview-delete?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/records/preview-delete', authenticate, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    if (!from || !to) return res.status(400).json({ message: 'from and to query parameters required (YYYY-MM-DD)' });

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    let fromTs = from;
    let toTs = to;
    if (dateOnly.test(from)) fromTs = `${from} 00:00:00`;
    if (dateOnly.test(to)) toTs = `${to} 23:59:59`;

    const [rows] = await pool.query(
      'SELECT id, token_number, deposited_at, returned_at FROM records WHERE status = ? AND deposited_at BETWEEN ? AND ? ORDER BY deposited_at DESC LIMIT 1000',
      ['returned', fromTs, toTs]
    );

    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete records by deposited_at date range where status = 'returned' (admin only)
// Use DELETE for REST idempotency: DELETE /api/admin/records/delete-range?from=...&to=...
router.delete('/records/delete-range', authenticate, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query || {};
    if (!from || !to) return res.status(400).json({ message: 'from and to query parameters required (YYYY-MM-DD)' });

    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    let fromTs = from;
    let toTs = to;
    if (dateOnly.test(from)) fromTs = `${from} 00:00:00`;
    if (dateOnly.test(to)) toTs = `${to} 23:59:59`;

    // select matching rows first so we can remove files from disk (person and item photos)
    const [rowsToDelete] = await pool.query(
      'SELECT id, person_photo_path FROM records WHERE status = ? AND deposited_at BETWEEN ? AND ?',
      ['returned', fromTs, toTs]
    );

    // Use a DB transaction and record per-file deletion status
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, person_photo_path FROM records WHERE status = ? AND deposited_at BETWEEN ? AND ? FOR UPDATE',
        ['returned', fromTs, toTs]
      );

      // gather item photo paths
      const ids = rows.map(r => r.id);
      let itemPhotos = [];
      if (ids.length) {
        const [items] = await conn.query('SELECT id, record_id, item_photo_path FROM items WHERE record_id IN (?)', [ids]);
        itemPhotos = items.map(it => ({ record_id: it.record_id, path: it.item_photo_path }));
      }

      async function tryUnlinkStatus(p) {
        if (!p) return { path: p, success: false, reason: 'no_path' };
        try {
          const rel = p.replace(/^[/\\]+/, '');
          const full = path.join(__dirname, '..', rel);
          await fs.promises.unlink(full);
          return { path: p, success: true };
        } catch (err) {
          return { path: p, success: false, reason: err && err.code ? err.code : String(err) };
        }
      }

      const perRecord = [];
      for (const r of rows) {
        const person = await tryUnlinkStatus(r.person_photo_path);
        const itemsForRec = itemPhotos.filter(ip => ip.record_id === r.id).map(x => x.path);
        const itemsUnlink = [];
        for (const p of itemsForRec) itemsUnlink.push(await tryUnlinkStatus(p));
        perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: person, item_unlink: itemsUnlink });
      }
      let result = { affectedRows: 0 };
      if (ids.length) {
        const [delRes] = await conn.query('DELETE FROM records WHERE id IN (?)', [ids]);
        result = delRes;
      }

      await conn.commit();

      // Audit log with per-file statuses
      try {
        const logsDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logsDir, 'audit.log');
        const entry = {
          timestamp: new Date().toISOString(),
          admin: req.user && req.user.username ? req.user.username : 'unknown',
          action: 'delete_returned_by_range',
          from: fromTs,
          to: toTs,
          deletedRows: result.affectedRows || 0,
          perRecord,
          ip: req.ip || req.headers['x-forwarded-for'] || null,
        };
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch (logErr) {
        console.error('Failed to write audit log', logErr);
      }

      res.json({ deletedRows: result.affectedRows });
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
