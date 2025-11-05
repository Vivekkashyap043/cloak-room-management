-- 001-add-event_date.sql
-- Safe migration to add `event_date` to `events` table and make it NOT NULL.
-- Usage: review and run only after taking a backup of your database.
-- This script is written to be safe for existing databases: it
-- 1) Adds the column as NULLABLE
-- 2) Offers two backfill strategies (uncomment one)
-- 3) Sets the column to NOT NULL

-- IMPORTANT: ALWAYS take a DB backup before running migrations on production.

BEGIN;

-- 1) Add the column as NULLABLE so the ALTER doesn't fail on existing rows.
ALTER TABLE `events`
  ADD COLUMN `event_date` DATE DEFAULT NULL;

-- 2) BACKFILL OPTIONS (choose one).
-- Option A: set legacy rows to today's date (quick, safe fallback).
--   Useful if you don't have historical dates and want a sensible default.
-- Uncomment the next line to apply Option A:
-- UPDATE `events` SET `event_date` = CURDATE() WHERE `event_date` IS NULL;

-- Option B: set a fixed legacy date (e.g. '1970-01-01') to indicate unknown.
--   Uncomment and change the date value if you prefer an explicit sentinel value.
-- UPDATE `events` SET `event_date` = '1970-01-01' WHERE `event_date` IS NULL;

-- Option C (recommended if you can): if you have a mapping file or manual
-- knowledge of specific event dates, run UPDATE statements to set correct
-- dates per event name before enforcing NOT NULL. Example:
-- UPDATE `events` SET `event_date` = '2025-10-01' WHERE `name` = 'Diwali Party';

-- 3) Validate there are no NULLs left (this will fail if any NULL remains).
SELECT COUNT(*) AS null_event_date_count FROM `events` WHERE `event_date` IS NULL;

-- If the above SELECT returns 0, you can safely make the column NOT NULL.
ALTER TABLE `events` MODIFY COLUMN `event_date` DATE NOT NULL;

COMMIT;

-- NOTES:
-- - If you run this on a large table and prefer non-blocking operations,
--   consider using pt-online-schema-change or equivalent tooling for your
--   MySQL version / environment.
-- - After this migration, update any application code that inserts into
--   `events` to always provide an `event_date` (your application already
--   expects this in the admin UI).
