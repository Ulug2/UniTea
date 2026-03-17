-- ============================================================
-- Migration: Initialize Supabase migration history table
--
-- Fixes dashboard error:
--   relation "supabase_migrations.schema_migrations" does not exist
--
-- Notes:
-- - Some projects (especially older or manually-managed ones) may not
--   have Supabase's migration history table created.
-- - This creates the schema/table in the form expected by the Supabase CLI.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[] NOT NULL DEFAULT '{}'::text[],
  name text
);

