-- Fixes an incomplete REVOKE in the previous migration
-- (20260816000000_phase10_polls_reports_final_hardening.sql), caught by
-- live verification before this was reported as done.
--
-- Root cause: this Supabase project has an ALTER DEFAULT PRIVILEGES rule
-- (`postgres`/`supabase_admin` roles, public schema, object type 'f')
-- that auto-grants EXECUTE to anon/authenticated/service_role on every
-- newly created function — so `REVOKE ALL ... FROM PUBLIC` right after
-- CREATE FUNCTION does not remove anon's own separately-held grant.
-- Symmetrically, get_report_university_id (created long before this
-- phase) still held a direct PUBLIC grant, which anon inherits regardless
-- of an anon-specific REVOKE, since every role is implicitly a member of
-- PUBLIC. Both REVOKEs below are required — the same lesson applies to
-- any future SECURITY DEFINER function in this project: always REVOKE
-- EXECUTE explicitly from both anon and PUBLIC, not just one.

REVOKE EXECUTE ON FUNCTION public.get_report_target_university_id(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_report_target_university_id(uuid, uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_report_university_id(uuid) FROM PUBLIC;
