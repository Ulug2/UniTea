-- Widen the reports.status check constraint to include 'working_on_it'.
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'working_on_it'::text, 'resolved'::text, 'rejected'::text]));
