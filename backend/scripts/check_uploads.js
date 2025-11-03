const path = require('path');
const fs = require('fs');
const pool = require('../db');

async function run() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  console.log('Uploads dir:', uploadsDir);
  try {
    // select all records and their photo paths
    const [rows] = await pool.query('SELECT id, person_photo_path, things_photo_path, status FROM records');
    console.log(`Found ${rows.length} records in DB`);
    let missing = [];
    let present = 0;
    for (const r of rows) {
      for (const key of ['person_photo_path', 'things_photo_path']) {
        const p = r[key];
        if (!p) continue;
        const rel = p.replace(/^[/\\]+/, '');
        const full = path.join(__dirname, '..', rel);
        const exists = fs.existsSync(full);
        if (!exists) missing.push({ id: r.id, key, path: p, status: r.status });
        else present++;
      }
    }

    console.log(`Present files: ${present}, Missing file references: ${missing.length}`);
    if (missing.length) {
      console.log('Missing entries (id, key, path, record_status):');
      for (const m of missing.slice(0, 200)) console.log(m);
    }

    // Summary per status
    const summary = {};
    for (const r of rows) {
      summary[r.status] = summary[r.status] || { records: 0, missing: 0 };
      summary[r.status].records++;
    }
    for (const m of missing) {
      summary[m.status] = summary[m.status] || { records: 0, missing: 0 };
      summary[m.status].missing++;
    }
    console.log('Summary by status:', summary);
    process.exit(0);
  } catch (err) {
    console.error('Error checking uploads', err);
    process.exit(2);
  }
}

run();
