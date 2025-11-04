# Clock Room Management

This repository contains a small full-stack app for managing cloak-room check-in/out records. It consists of a Node/Express backend with MySQL and a React + Vite frontend. This README documents setup steps, DB schema, key endpoints, scripts, and troubleshooting notes.

---

## Repo layout

- `backend/` — Node.js + Express server, multer uploads, MySQL access via `mysql2` pool.
  - `routes/` — Express route handlers (including `admin.js` and `records.js`).
  - `uploads/` — disk directory where uploaded photos are stored (served at `/uploads`).
  # Cloak Room Management — Setup & Quickstart

  This repository contains a small full-stack app for managing cloak-room check-in/out records. It uses:
  - Backend: Node.js + Express, MySQL (mysql2), multer for uploads.
  - Frontend: React (Vite).

  This README gives simple, step-by-step instructions to get the project running on a local machine (Windows PowerShell examples). It also documents the database schema and admin actions (deleting users/records). No complex authentication explanation is included — just enough to run and test locally.

  ## Table of contents
  - Prerequisites
  - Clone the repo
  - Backend setup (env, deps, DB)
  - Frontend setup
  - Running the app (dev)
  - Database schema (what fields mean)
  - Admin delete behavior and audit logs
  - Helpful scripts and troubleshooting

  ## Prerequisites
  - Node.js (LTS recommended, v16+). Install from https://nodejs.org/
  - MySQL Server (or MariaDB). Make sure you can create a database and run SQL scripts.
  - git (to clone the repo)

  ## 1) Clone the repository

  Open PowerShell and run:

  ```powershell
  cd C:\path\to\projects
  git clone https://github.com/Vivekkashyap043/cloak-room-management.git
  cd cloak-room-management
  ```

  ## 2) Backend: install dependencies and create an .env

  ```powershell
  cd .\backend
  npm install
  ```

  Create a `.env` file at `backend/.env`. If an example file exists, copy it. Otherwise create a new `.env` with these values (replace placeholders):

  ```
  DB_HOST=localhost
  DB_USER=your_mysql_user
  DB_PASS=your_mysql_password
  DB_NAME=cloakroomdb
  PORT=4000
  JWT_SECRET=some-long-secret
  ```

  Notes:
  - `DB_NAME` above should match the database name you'll create below (the included schema uses `cloakroomdb`).
  - `JWT_SECRET` is used by the simple admin auth middleware — pick any long random string for development.

  ## 3) Create the database and load schema

  Open a MySQL client and run the provided schema file. From PowerShell you can run:

  ```powershell
  # adjust username/password as needed
  mysql -u root -p < .\backend\schema.sql
  ```

  Or: open a MySQL client and run the SQL commands from `backend/schema.sql`. The provided schema creates these tables: `users`, `records`, `items`.

  ## 4) Start the backend (development)

  ```powershell
  cd .\backend
  npm run dev    # or `node server.js` / `npm start` depending on your scripts
  ```

  By default the backend listens on the port in `.env` (commonly 4000). It serves API routes under `/api` and uploaded images under `/uploads` (files saved to `backend/uploads`).

  ## 5) Frontend: install dependencies and start dev server

  Open a new terminal:

  ```powershell
  cd .\frontend
  npm install
  npm run dev
  ```

  Vite usually opens at http://localhost:5173. The dev server is configured to proxy `/api` and `/uploads` to the backend, so the frontend can call relative paths like `fetch('/api/records')` and render images from `/uploads/<filename>`.

  ## 6) Quick manual check (smoke test)
  - Open the frontend in your browser.
  - Use the Entry form to create a record (upload person photo and item photos). Submit should call `/api/records`.
  - Use the Exit page to search for the token and return the item.
  - Use the Admin panel to preview or delete returned records.

  ## Database schema (simple explanation)
  The important tables are:

  - `users` — simple accounts used by the admin UI. Important columns:
    - `id`, `username`, `password_hash`, `role` (`admin` or `user`), `location` (`gents location` or `ladies location`)

  - `records` — one row per deposit (a person leaves items). Important columns:
    - `id` — primary key
    - `token_number` — unique token label shown on tickets and QR codes
    - `location` — which cloakroom (populated from the authenticated user's location)
    - `person_photo_path` — web path such as `/uploads/<filename>` (may be NULL)
    - `status` — `deposited` or `returned`
    - `deposited_at`, `returned_at`

  - `items` — each record may have multiple item rows. Important columns:
    - `id`, `record_id` (FK -> records.id), `item_name`, `item_count`, `item_photo_path` (optional)

  Notes:
  - `items.record_id` has `ON DELETE CASCADE` so deleting records will also remove associated items in the DB. Upload files are not automatically removed from disk by MySQL — the server code unlinks files when deleting records.

  ## Admin deletion behavior and audit logs
  The admin routes support:
  - Deleting a specific user: `DELETE /api/admin/users/:username` — the backend now deletes that user and also permanently deletes any `returned` records for the user's `location`. When deleting records the server:
    - Locks selected rows in a transaction
    - Unlinks filesystem files referenced by `person_photo_path` and `items.item_photo_path` (if present)
    - Deletes the DB rows (items are cascade-deleted)
    - Writes a JSON line to `backend/logs/audit.log` with per-record unlink results (success/failure reasons)

  - Deleting returned records by date range: `DELETE /api/admin/records/delete-range?from=YYYY-MM-DD&to=YYYY-MM-DD` — permanently removes returned records in the date range and their photo files.

  Audit log format (append-only JSON lines)
  - Log lines are appended to `backend/logs/audit.log`. Each entry includes `action`, `admin`, `timestamp`, `deletedRows`, and `perRecord` where each record lists unlink results for person and item photos. This helps verify which files were removed successfully.

  ## Helpful scripts
  - `node backend/scripts/check_uploads.js` — scans DB photo path columns and reports missing files on disk. Useful after bulk deletes to find stale references.

  ## Troubleshooting tips
  - If the frontend shows proxy errors (ECONNREFUSED) make sure the backend is running and using the port set in `backend/.env`.
  - If image upload/deletion behaves unexpectedly, check `backend/logs/audit.log` for unlink errors and the `backend/uploads` folder for files.
  - If you're missing `req.user.location` in production, ensure your auth middleware sets `req.user.location` correctly (the server relies on it to filter and delete records by location).

  ## Security notes (short)
  - Keep `JWT_SECRET` private in production.
  - Uploaded files are stored on disk; if you'll run this in production, consider moving uploads to a dedicated object store (S3) or protect the uploads directory.

  ## Common commands summary (PowerShell)
  ```powershell
  # Backend
  cd .\backend
  npm install
  # edit backend/.env (DB credentials, PORT, JWT_SECRET)
  npm run dev

  # Frontend
  cd ..\frontend
  npm install
  npm run dev

  # Run upload checker
  cd ..\backend
  node .\scripts\check_uploads.js
  ```

  If you'd like, I can also:
  - Add an `env.example` file to `backend/` and `frontend/` for convenience.
  - Add a small admin-only UI to preview `perRecord` unlink results immediately after a delete.
  - Change unlink behavior to rollback DB deletes if any unlink fails (currently unlink failures are recorded in the audit log but DB deletes proceed).

  If you want me to make any of those follow-ups, tell me which one and I'll implement it.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
