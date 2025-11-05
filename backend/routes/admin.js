const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const moment = require('moment-timezone');
const ExcelJS = require('exceljs');

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

// Export records as PDF, XLSX, or CSV
// GET /api/admin/records/export?format=pdf|xlsx|csv&...filters...
router.get('/records/export', authenticate, requireAdmin, async (req, res) => {
  try {
    const fmt = (req.query.format || 'xlsx').toLowerCase();
    if (fmt !== 'xlsx') return res.status(400).json({ message: 'format must be xlsx' });

    const { where, params } = buildFilters(req.query);
    let sql = `SELECT r.id as record_id, r.token_number, r.location, r.event_name, r.status, r.deposited_at, r.returned_at, i.id as item_id, i.item_name, i.item_count,
      e.event_incharge AS event_incharge, e.incharge_phone AS incharge_phone
      FROM records r
      LEFT JOIN items i ON i.record_id = r.id
      LEFT JOIN events e ON e.name = r.event_name AND e.event_location = r.location`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY r.deposited_at DESC';
    // cap export size
    sql += ' LIMIT 5000';
    const [rows] = await pool.query(sql, params);

    const map = new Map();
    for (const r of rows) {
      const rid = r.record_id;
      if (!map.has(rid)) {
    map.set(rid, { id: rid, token_number: r.token_number, event_name: r.event_name || null, event_incharge: r.event_incharge || '', incharge_phone: r.incharge_phone || '', location: r.location, deposited_at: r.deposited_at ? moment.tz(r.deposited_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null, returned_at: r.returned_at ? moment.tz(r.returned_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null, status: r.status, items: [] });
      }
      if (r.item_id) map.get(rid).items.push(`${r.item_name || ''} x${r.item_count || 0}`);
    }
    const out = Array.from(map.values());

    if (fmt === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Report');
      sheet.columns = [
        { header: 'Token', key: 'token', width: 12 },
        { header: 'Event', key: 'event', width: 30 },
        { header: 'In-charge', key: 'incharge', width: 24 },
        { header: 'In-charge Phone', key: 'incharge_phone', width: 18 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Deposited At', key: 'deposited', width: 20 },
        { header: 'Returned At', key: 'returned', width: 20 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Items', key: 'items', width: 80 }
      ];

      for (const r of out) {
  sheet.addRow({ token: r.token_number, event: r.event_name || '', incharge: r.event_incharge || '', incharge_phone: r.incharge_phone || '', location: r.location || '', deposited: r.deposited_at || '', returned: r.returned_at || '', status: r.status || '', items: (r.items || []).join('; ') });
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }
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

// Preview records matching arbitrary filters: event_name, status, from, to
// GET /api/admin/records/preview-filter?event=NAME&status=STATUS&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/records/preview-filter', authenticate, requireAdmin, async (req, res) => {
  try {
    const { event: eventName, status, from, to, location } = req.query || {};
    // normalize possible multi-value query params (comma-separated or repeated keys)
    function normalizeQ(v) {
      if (!v) return null;
      if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
      if (typeof v === 'string') {
        if (v.indexOf(',') >= 0) return v.split(',').map(x => x.trim()).filter(Boolean);
        return [v.trim()];
      }
      return null;
    }
    const eventArr = normalizeQ(eventName);
    const statusArr = normalizeQ(status);
    const locationArr = normalizeQ(location);
    const where = [];
    const params = [];

    if (eventArr && eventArr.length) {
      where.push('event_name IN (?)');
      params.push(eventArr);
    }
    if (locationArr && locationArr.length) {
      where.push('location IN (?)');
      params.push(locationArr);
    }
    if (statusArr && statusArr.length) {
      where.push('status IN (?)');
      params.push(statusArr);
    }
    // date handling: if from and/or to present, treat as deposited_at bounds
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    let fromTs = null;
    let toTs = null;
    if (from && dateOnly.test(from)) fromTs = `${from} 00:00:00`;
    if (to && dateOnly.test(to)) toTs = `${to} 23:59:59`;
    if (fromTs && toTs) {
      where.push('deposited_at BETWEEN ? AND ?');
      params.push(fromTs, toTs);
    } else if (fromTs) {
      where.push('deposited_at BETWEEN ? AND ?');
      params.push(fromTs, new Date().toISOString().slice(0, 19).replace('T', ' '));
    } else if (toTs) {
      where.push('deposited_at <= ?');
      params.push(toTs);
    }

  if (where.length === 0) return res.status(400).json({ message: 'At least one filter required (event, status, location, from, to)' });

    const sql = `SELECT id, token_number, deposited_at, returned_at, status, location FROM records WHERE ${where.join(' AND ')} ORDER BY deposited_at DESC LIMIT 1000`;
  const [rows] = await pool.query(sql, params);
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper: build WHERE clause and params from query filters
function buildFilters(q) {
  const { token, event, location, status, from, to, deposited, returned, returned_from, returned_to } = q || {};
  const where = [];
  const params = [];

  function norm(v) {
    if (!v) return null;
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') {
      if (v.indexOf(',') >= 0) return v.split(',').map(x => x.trim()).filter(Boolean);
      return [v.trim()];
    }
    return null;
  }

  const tokenArr = norm(token);
  const eventArr = norm(event);
  const locationArr = norm(location);
  const statusArr = norm(status);

  if (tokenArr && tokenArr.length) {
    // token number exact match or multiple
    where.push('r.token_number IN (?)');
    params.push(tokenArr);
  }
  if (eventArr && eventArr.length) {
    where.push('r.event_name IN (?)');
    params.push(eventArr);
  }
  if (locationArr && locationArr.length) {
    where.push('r.location IN (?)');
    params.push(locationArr);
  }
  if (statusArr && statusArr.length) {
    where.push('r.status IN (?)');
    params.push(statusArr);
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  // Deposited: support either a single exact date (deposited) or a range (from/to)
  let depFrom = null, depTo = null;
  if (deposited && dateOnly.test(deposited)) {
    depFrom = `${deposited} 00:00:00`;
    depTo = `${deposited} 23:59:59`;
  } else {
    if (from && dateOnly.test(from)) depFrom = `${from} 00:00:00`;
    if (to && dateOnly.test(to)) depTo = `${to} 23:59:59`;
  }
  if (depFrom && depTo) {
    where.push('r.deposited_at BETWEEN ? AND ?');
    params.push(depFrom, depTo);
  } else if (depFrom) {
    where.push('r.deposited_at >= ?');
    params.push(depFrom);
  } else if (depTo) {
    where.push('r.deposited_at <= ?');
    params.push(depTo);
  }

  // Returned: only single-date filter supported (returned)
  if (returned && dateOnly.test(returned)) {
    const rFrom = `${returned} 00:00:00`;
    const rTo = `${returned} 23:59:59`;
    where.push('r.returned_at BETWEEN ? AND ?');
    params.push(rFrom, rTo);
  } else {
    // backwards-compatible support for returned_from/returned_to if provided
    let retFrom = null, retTo = null;
    if (returned_from && dateOnly.test(returned_from)) retFrom = `${returned_from} 00:00:00`;
    if (returned_to && dateOnly.test(returned_to)) retTo = `${returned_to} 23:59:59`;
    if (retFrom && retTo) {
      where.push('r.returned_at BETWEEN ? AND ?');
      params.push(retFrom, retTo);
    } else if (retFrom) {
      where.push('r.returned_at >= ?');
      params.push(retFrom);
    } else if (retTo) {
      where.push('r.returned_at <= ?');
      params.push(retTo);
    }
  }

  return { where, params };
}

// GET /api/admin/records/all - return recent records (with items) for admin report
// Supports filters via query params: token, event, location, status, from, to (deposited range), returned_from, returned_to and optional limit
router.get('/records/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    // Join events table to pull event in-charge info (match by name + location)
    let sql = `SELECT r.id as record_id, r.token_number, r.location, r.event_name, r.person_photo_path, r.status, r.deposited_at, r.returned_at,
      i.id as item_id, i.item_name, i.item_count, i.item_photo_path,
      e.event_incharge AS event_incharge, e.incharge_phone AS incharge_phone
      FROM records r
      LEFT JOIN items i ON i.record_id = r.id
      LEFT JOIN events e ON e.name = r.event_name AND e.event_location = r.location`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY r.deposited_at DESC';
    const limit = parseInt(req.query.limit || '2000', 10) || 2000;
    sql += ` LIMIT ${limit}`;
    const [rows] = await pool.query(sql, params);
    const map = new Map();
    for (const r of rows) {
      const rid = r.record_id;
      if (!map.has(rid)) {
        map.set(rid, {
          id: rid,
          token_number: r.token_number,
          event_name: r.event_name || null,
          event_incharge: r.event_incharge || null,
          incharge_phone: r.incharge_phone || null,
          location: r.location,
          person_photo_path: r.person_photo_path || null,
          status: r.status,
          deposited_at: r.deposited_at ? moment.tz(r.deposited_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null,
          returned_at: r.returned_at ? moment.tz(r.returned_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null,
          items: []
        });
      }
      if (r.item_id) {
        map.get(rid).items.push({ id: r.item_id, item_name: r.item_name, item_count: r.item_count, item_photo_path: r.item_photo_path || null });
      }
    }
    const out = Array.from(map.values());
    res.json({ count: out.length, records: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete records matching arbitrary filters: event_name, status, from, to
// DELETE /api/admin/records?event=NAME&status=STATUS&from=YYYY-MM-DD&to=YYYY-MM-DD
router.delete('/records', authenticate, requireAdmin, async (req, res) => {
  try {
    // Accept both query params and body (for names etc.) but prefer query
    const { event: eventName, status, from, to, location } = req.query || {};
    const where = [];
    const params = [];
    function normalizeQ2(v) {
      if (!v) return null;
      if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
      if (typeof v === 'string') {
        if (v.indexOf(',') >= 0) return v.split(',').map(x => x.trim()).filter(Boolean);
        return [v.trim()];
      }
      return null;
    }
    const eventArr2 = normalizeQ2(eventName);
    const statusArr2 = normalizeQ2(status);
    const locationArr2 = normalizeQ2(location);

    if (eventArr2 && eventArr2.length) {
      where.push('event_name IN (?)');
      params.push(eventArr2);
    }
    if (locationArr2 && locationArr2.length) {
      where.push('location IN (?)');
      params.push(locationArr2);
    }
    if (statusArr2 && statusArr2.length) {
      where.push('status IN (?)');
      params.push(statusArr2);
    }
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
    let fromTs = null;
    let toTs = null;
    if (from && dateOnly.test(from)) fromTs = `${from} 00:00:00`;
    if (to && dateOnly.test(to)) toTs = `${to} 23:59:59`;
    if (fromTs && toTs) {
      where.push('deposited_at BETWEEN ? AND ?');
      params.push(fromTs, toTs);
    } else if (fromTs) {
      where.push('deposited_at BETWEEN ? AND ?');
      params.push(fromTs, new Date().toISOString().slice(0, 19).replace('T', ' '));
    } else if (toTs) {
      where.push('deposited_at <= ?');
      params.push(toTs);
    }

  if (where.length === 0) return res.status(400).json({ message: 'At least one filter required (event, status, location, from, to)' });

    // select matching rows and gather file paths
    const sqlSel = `SELECT id, person_photo_path FROM records WHERE ${where.join(' AND ')}`;
    const [rows] = await pool.query(sqlSel, params);
    const ids = rows.map(r => r.id);

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // lock the rows
      const [locked] = await conn.query(`SELECT id, person_photo_path FROM records WHERE ${where.join(' AND ')} FOR UPDATE`, params);
      const lockedIds = locked.map(r => r.id);

      // gather item photo paths
      let itemPhotos = [];
      if (lockedIds.length) {
        const [items] = await conn.query('SELECT id, record_id, item_photo_path FROM items WHERE record_id IN (?)', [lockedIds]);
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
      for (const r of locked) {
        const person = await tryUnlinkStatus(r.person_photo_path);
        const itemsForRec = itemPhotos.filter(ip => ip.record_id === r.id).map(x => x.path);
        const itemsUnlink = [];
        for (const p of itemsForRec) itemsUnlink.push(await tryUnlinkStatus(p));
        perRecord.push({ id: r.id, person_photo_path: r.person_photo_path || null, person_unlink: person, item_unlink: itemsUnlink });
      }

      let result = { affectedRows: 0 };
      if (lockedIds.length) {
        const [delRes] = await conn.query('DELETE FROM records WHERE id IN (?)', [lockedIds]);
        result = delRes;
      }

      await conn.commit();

      // audit log
      try {
        const logsDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logsDir, 'audit.log');
        const entry = {
            timestamp: new Date().toISOString(),
            admin: req.user && req.user.username ? req.user.username : 'unknown',
            action: 'delete_records_by_filter',
            filters: { event: eventName || null, status: status || null, location: location || null, from: from || null, to: to || null },
            deletedRows: result.affectedRows || 0,
            perRecord,
            ip: req.ip || req.headers['x-forwarded-for'] || null,
          };
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch (logErr) { console.error('Failed to write audit log', logErr); }

      return res.json({ deletedRows: result.affectedRows });
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

// Events management endpoints (admin only)
// GET /api/admin/events - list all events
router.get('/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description, event_date, event_status, event_incharge, incharge_phone, event_location, created_at FROM events ORDER BY created_at DESC');
    // convert created_at and event_date to IST/ISO for responses
    const out = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      event_date: r.event_date ? moment.tz(r.event_date, 'Asia/Kolkata').format('YYYY-MM-DD') : null,
      event_status: r.event_status || 'active',
      event_incharge: r.event_incharge || null,
      incharge_phone: r.incharge_phone || null,
      event_location: r.event_location || null,
      created_at: r.created_at ? moment.tz(r.created_at, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null
    }));
    res.json({ events: out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/events - create an event { name, description, event_date }
router.post('/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, event_date, event_incharge, incharge_phone, event_location, event_status } = req.body || {};
  if (!name) return res.status(400).json({ message: 'Event name required' });
  if (!event_date) return res.status(400).json({ message: 'Event date required (YYYY-MM-DD)' });
  if (!event_incharge) return res.status(400).json({ message: 'Event in-charge name required' });
  if (!incharge_phone) return res.status(400).json({ message: 'Event in-charge phone required' });
    // sanitize location default
    const loc = event_location && ['gents location', 'ladies location'].includes(event_location) ? event_location : 'gents location';
    const status = event_status && ['active','inactive'].includes(event_status) ? event_status : 'active';
    // validate date format YYYY-MM-DD
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(event_date)) return res.status(400).json({ message: 'Invalid event_date format; use YYYY-MM-DD' });
  // simple uniqueness check — allow same event name in different locations
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

// PATCH /api/admin/events/:id - update event attributes (e.g., set inactive)
router.patch('/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { event_status } = req.body || {};
    if (!event_status || !['active','inactive'].includes(event_status)) return res.status(400).json({ message: 'Provide event_status as "active" or "inactive"' });
    // If setting to active, ensure no other active event exists at same location
    if (event_status === 'active') {
      // find event location first by id
      const [evs] = await pool.query('SELECT event_location FROM events WHERE id = ? LIMIT 1', [id]);
      if (!evs.length) return res.status(404).json({ message: 'Event not found' });
      const loc = evs[0].event_location;
      const [act] = await pool.query('SELECT id FROM events WHERE event_status = ? AND event_location = ? AND id <> ? LIMIT 1', ['active', loc, id]);
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

// DELETE /api/admin/events/:id - delete single event by id
router.delete('/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [del] = await pool.query('DELETE FROM events WHERE id = ?', [id]);
    if (del.affectedRows === 0) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'event deleted', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/events?all=true  -> delete all events
// or DELETE /api/admin/events with body { ids: [...] } -> delete specific events by id
router.delete('/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const all = req.query.all === 'true';
    if (all) {
      await pool.query('DELETE FROM events');
      return res.json({ message: 'all events deleted' });
    }
    const ids = (req.body && req.body.ids) || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Provide ids array or set ?all=true' });
    const [del] = await pool.query('DELETE FROM events WHERE id IN (?)', [ids]);
    res.json({ message: 'events deleted', deleted: del.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
