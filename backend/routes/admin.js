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
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'username and password required' });
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (exists.length) return res.status(400).json({ message: 'username already exists' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'user']);
    res.json({ message: 'user created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete user by username (admin only)
router.delete('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username;
    await pool.query('DELETE FROM users WHERE username = ?', [username]);
    res.json({ message: 'user deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// get user by username (admin only) - for search
router.get('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username;
    const [rows] = await pool.query('SELECT id, username, role, created_at FROM users WHERE username = ? LIMIT 1', [username]);
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

    // select rows to delete (lock them) and gather file paths
    const [rows] = await conn.query("SELECT id, person_photo_path, things_photo_path FROM records WHERE status = 'returned' FOR UPDATE");

    // helper to delete a file and return a status object
    async function tryUnlinkStatus(p) {
      if (!p) return { path: p, success: false, reason: 'no_path' };
      try {
        const rel = p.replace(/^[/\\]+/, '');
        const full = path.join(__dirname, '..', rel);
        await fs.promises.unlink(full).then(() => ({ path: p, success: true })).catch(err => ({ path: p, success: false, reason: err && err.code ? err.code : String(err) }));
      } catch (err) {
        return { path: p, success: false, reason: err && err.message ? err.message : String(err) };
      }
    }

    const perRecord = [];
    for (const r of rows) {
      const person = await tryUnlinkStatus(r.person_photo_path);
      const things = await tryUnlinkStatus(r.things_photo_path);
      perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: person, things_photo_path: r.things_photo_path || null, things_unlink: things });
    }

    // perform DB delete using ids to ensure we only delete selected rows
    const ids = rows.map(r => r.id);
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
      "SELECT id, token_number, person_name, submitted_at, returned_at FROM records WHERE status = 'returned' ORDER BY submitted_at DESC LIMIT 1000"
    );
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// preview records that would be deleted for a given submitted_at date range where status = 'returned'
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
      'SELECT id, token_number, person_name, submitted_at, returned_at FROM records WHERE status = ? AND submitted_at BETWEEN ? AND ? ORDER BY submitted_at DESC LIMIT 1000',
      ['returned', fromTs, toTs]
    );

    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete records by submitted_at date range where status = 'returned' (admin only)
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

    // select matching rows first so we can remove files from disk
    const [rowsToDelete] = await pool.query(
      'SELECT id, person_photo_path, things_photo_path FROM records WHERE status = ? AND submitted_at BETWEEN ? AND ?',
      ['returned', fromTs, toTs]
    );

    // Use a DB transaction and record per-file deletion status
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, person_photo_path, things_photo_path FROM records WHERE status = ? AND submitted_at BETWEEN ? AND ? FOR UPDATE',
        ['returned', fromTs, toTs]
      );

      async function tryUnlinkStatus(p) {
        if (!p) return { path: p, success: false, reason: 'no_path' };
        try {
          const rel = p.replace(/^[/\\]+/, '');
          const full = path.join(__dirname, '..', rel);
          await fs.promises.unlink(full).then(() => ({ path: p, success: true })).catch(err => ({ path: p, success: false, reason: err && err.code ? err.code : String(err) }));
        } catch (err) {
          return { path: p, success: false, reason: err && err.message ? err.message : String(err) };
        }
      }

      const perRecord = [];
      for (const r of rows) {
        const person = await tryUnlinkStatus(r.person_photo_path);
        const things = await tryUnlinkStatus(r.things_photo_path);
        perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: person, things_photo_path: r.things_photo_path || null, things_unlink: things });
      }

      const ids = rows.map(r => r.id);
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
