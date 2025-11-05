Migration: add `event_date` to `events` table
=============================================

Files added
- `001-add-event_date.sql` — safe SQL migration with backfill options and notes.

Pre-run checklist
1. Backup your database. Example (PowerShell):
   # dump the database (replace placeholders)
   mysqldump -u <db_user> -p<db_password> <db_name> > C:\backups\clockroom_$(Get-Date -Format yyyyMMdd_HHmmss).sql

2. Confirm you have a working connection string / credentials and have permissions to ALTER tables.

How the SQL script works
- Adds `event_date` as a NULLABLE DATE column.
- Provides multiple backfill options (choose one by uncommenting the appropriate UPDATE):
  - Option A: set NULL event_date values to today's date (fast fallback)
  - Option B: set a sentinel date like '1970-01-01' to indicate unknown
  - Option C: manually set specific event dates by event name (recommended when available)
- Validates there are no remaining NULLs, then modifies the column to be NOT NULL.

Running the migration (PowerShell example)
1. Copy `001-add-event_date.sql` to a place the DB can access, or run it from your workstation.
2. Using the mysql client:
   mysql -u <db_user> -p -D <db_name> < .\\backend\\scripts\\001-add-event_date.sql

   If you prefer to open an interactive session and source the file:
   mysql -u <db_user> -p -D <db_name>
   mysql> SOURCE d:/projects/clock-room-management/backend/scripts/001-add-event_date.sql;

3. Inspect the output of the SELECT COUNT(*) query in the script. If it's non-zero, DO NOT proceed to make the column NOT NULL — instead backfill or fix the rows first.

Rollback strategy
- If you need to roll back, restore from the SQL dump you created at step 1. Alternatively, you can reverse the migration by running:
  ALTER TABLE `events` DROP COLUMN `event_date`;

Notes & recommendations
- Prefer Option C (manual mapping) if you can determine real event dates for historical events.
- For very large tables, ALTER TABLE may lock the table. Use online schema change tools (e.g., pt-online-schema-change) for zero-downtime alterations.
- After migration, ensure your app code (backend admin create endpoint) always sets `event_date` when creating events.

If you want, I can also:
- Create a small node.js migration script that reads DB credentials from your project's env and applies the safe steps interactively.
- Generate a one-off SQL file that sets legacy rows to a specific date based on a CSV mapping you provide.
