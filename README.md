# Clock Room Management

This repository contains a small full-stack app for managing clock-room check-in/out records. It consists of a Node/Express backend with MySQL and a React + Vite frontend. This README documents setup steps, DB schema, key endpoints, scripts, and troubleshooting notes.

---

## Repo layout

- `backend/` — Node.js + Express server, multer uploads, MySQL access via `mysql2` pool.
  - `routes/` — Express route handlers (including `admin.js` and `records.js`).
  - `uploads/` — disk directory where uploaded photos are stored (served at `/uploads`).
  - `scripts/check_uploads.js` — read-only script to compare DB photo paths to files on disk.
  - `logs/audit.log` — append-only audit log (JSON lines) written by admin delete flows.
  - `package.json` — backend dependencies and start script.

- `frontend/` — React + Vite UI.
  - `src/` — React source files including `pages/AdminDashboard.jsx`.
  - `vite.config.js` — dev server proxy (configured to forward `/api` and `/uploads` to backend in dev).
  - `package.json` — frontend dependencies and dev scripts.

---

## Setup from scratch (step-by-step)

This section explains how to get the project running from an empty machine. Follow each step in order. Commands below are PowerShell examples for Windows; adapt them if you're using macOS or Linux.

Prerequisites
- Node.js (LTS recommended, 16+). Install from https://nodejs.org/
- npm (bundled with Node.js)
- MySQL server (or MariaDB). Ensure you can create a database and a user.

1) Clone the repository

```powershell
cd C:\path\to\projects
git clone https://github.com/Vivekkashyap043/cloak-room-management.git
cd cloak-room-management
```

2) Backend: install dependencies and configure environment

```powershell
cd D:\projects\clock-room-management\backend
npm install
```

Create a `.env` file by copying the example and editing values:

```powershell
copy .\.env.example .\.env
notepad .\.env
```

Edit `.env` and set these values (example):

- DB_HOST=localhost
- DB_USER=your_mysql_user
- DB_PASS=your_mysql_password
- DB_NAME=clockroom
- PORT=4000
- JWT_SECRET=some-long-secret

3) Backend: create the database and load schema

Open your MySQL client and run:

```sql
CREATE DATABASE IF NOT EXISTS clockroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE clockroom;
SOURCE schema.sql;
```

Or use the `mysql` CLI from PowerShell (adjust username/password):

```powershell
mysql -u your_mysql_user -p your_mysql_password < .\schema.sql
```

4) Start the backend server

```powershell
npm start
# during development you can use: nodemon server.js
```

By default the backend listens on the port set in `.env` (commonly 4000). It serves API routes under `/api` and uploaded images under `/uploads`.

5) Frontend: install and run (development)

Open a new terminal and run:

```powershell
cd D:\projects\clock-room-management\frontend
npm install
npm run dev
```

Vite runs the dev server on http://localhost:5173 by default. Vite is configured to proxy `/api` and `/uploads` to the backend during development so the frontend can use relative fetch paths such as `/api/records`.

6) Build for production (optional)

```powershell
cd D:\projects\clock-room-management\frontend
npm run build
```

If your backend and frontend are in the same repo layout, the backend will serve the built frontend from `../frontend/dist` automatically. Otherwise copy the `dist` output to your webserver.

---

---

## Backend configuration and environment

Required environment variables (example):

- `DB_HOST` — MySQL host
- `DB_USER` — MySQL user
- `DB_PASS` — MySQL password
- `DB_NAME` — MySQL database
- `PORT` — server port (default used in dev is 4000)
- `JWT_SECRET` — secret for admin auth tokens

The backend uses `multer` to write uploaded files to `backend/uploads` and exposes that directory via `app.use('/uploads', express.static(uploadsDir))`, so uploaded files are available at `/uploads/<filename>`.

### Audit log

Admin deletion flows (permanent purge and date-range deletes) write append-only audit entries as JSON lines to `backend/logs/audit.log`. Each line looks like:

```json
{
  "action": "permanent-delete",
  "performedBy": "admin-username",
  "timestamp": "2025-11-03T12:34:56.789Z",
  "deletedRows": 5,
  "perRecord": [
    { "id": 123, "person_photo_path": "/uploads/abc.jpg", "person_unlink": { "success": true } },
    { "id": 124, "things_photo_path": "/uploads/def.jpg", "things_unlink": { "success": false, "reason": "ENOENT" } }
  ]
}
```

This lets you see per-file unlink successes/failures (the current policy is to commit DB deletions while recording unlink failures for observability). If you prefer rollback-on-unlink-failure, see "Changing unlink policy" below.

---

## Database schema (reference)

Below are the important tables and columns used by the app. Adjust names if your database differs.

Example `records` table:

```sql
CREATE TABLE records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token_number VARCHAR(64),
  person_name VARCHAR(255),
  person_photo_path VARCHAR(512), -- e.g. '/uploads/<filename>' or NULL
  things_photo_path VARCHAR(512), -- e.g. '/uploads/<filename>' or NULL
  status ENUM('checked_in','returned','soft-deleted') DEFAULT 'checked_in',
  submitted_at DATETIME,
  returned_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Example `users` table (admin accounts):

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(128) UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(32) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Adjust types for your environment. The backend code expects photo path columns to contain web-accessible paths starting with `/uploads/`.

---

## Important backend scripts

- `backend/scripts/check_uploads.js` — compares DB photo path columns (`person_photo_path`, `things_photo_path`) with files on disk and prints a summary of missing vs present files. Useful for auditing orphaned DB references.

Run it from the backend folder:

```powershell
cd D:\projects\clock-room-management\backend
node .\scripts\check_uploads.js
```

---

## Admin endpoints (selected)

- `POST /api/admin/users` — create user (body: `{ username, password }`)
- `GET  /api/admin/users/:query` — search user
- `DELETE /api/admin/users/:username` — delete user
- `GET  /api/admin/records/preview-permanent` — preview records marked soft-deleted
- `DELETE /api/admin/records/permanent` — permanently delete soft-deleted records (transactional; unlinks files and logs per-file results)
- `GET  /api/admin/records/preview-delete?from=YYYY-MM-DD&to=YYYY-MM-DD` — preview records for date-range delete
- `DELETE /api/admin/records/delete-range?from=...&to=...` — delete records in the date range (transactional; logs unlink outcomes)

Refer to `backend/routes/admin.js` for full implementations and details.

---

## Frontend notes

- Use relative requests like `fetch('/api/admin/records/preview-delete?...')` — Vite dev proxy forwards these to the backend.
- The frontend expects photo path fields in server responses to already be web paths (e.g. `/uploads/abc.jpg`). Use the path returned from the backend as `<img src={r.person_photo_path} />`.

If the dev Vite server is not proxied, image requests to `/uploads/...` must point directly to the backend origin.

---

## Changing unlink policy

Current behavior: the server wraps DB deletions in a transaction and attempts filesystem unlinking for any referenced files. The unlink results are recorded in the audit log; DB rows are removed even if some unlink operations fail.

Alternatives:

- Rollback on unlink failure: change the code in `backend/routes/admin.js` to throw/rollback if any unlink returns failure. This prevents records being removed when file deletion fails.
- Background unlink queue: commit DB delete and queue failed unlink tasks to a background worker which retries; this keeps DB clean but handles transient filesystem issues.

If you'd like, I can change the code to one of these policies — tell me which option you prefer.

---

## Troubleshooting

- Vite parser errors: these are usually caused by malformed JSX, duplicate imports, or stray Unicode characters in JSX. If you see `Unexpected token` pointing to a line with JSX comments or interpolations, inspect for unclosed comment blocks or duplicate imports.
- Backend file-not-found unlink errors: check `backend/logs/audit.log` to see which unlink operations failed and why. For `ENOENT` the file was already missing; `EACCES` indicates permission issues.
- If the frontend images don't show: verify the backend is running and that `backend/uploads` contains the referenced files, and that Vite is proxying `/uploads` to the backend in dev.

---

## Next steps & E2E verification checklist

1. Start backend (with correct env vars) and confirm it serves `/uploads` (open `http://localhost:4000/uploads/` and check a filename).
2. Start frontend (`npm run dev`) — ensure Vite shows proxy entries for `/api` and `/uploads` in the console.
3. Use the Admin UI to preview and perform delete operations.
4. Inspect `backend/logs/audit.log` for per-file unlink statuses.
5. Run `node backend/scripts/check_uploads.js` to produce a snapshot of DB vs disk file presence.
