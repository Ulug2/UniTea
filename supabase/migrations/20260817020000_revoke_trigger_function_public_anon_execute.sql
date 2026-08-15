BEGIN;

-- ============================================================
-- Revoke unnecessary PUBLIC/anon EXECUTE grants on trigger-only
-- SECURITY DEFINER functions
-- ============================================================
--
-- CONTEXT
--
-- PostgreSQL refuses to invoke a RETURNS trigger function via normal
-- SQL ("trigger functions can only be called as triggers") regardless
-- of any role's EXECUTE privilege on it — the trigger mechanism itself
-- invokes these, not a role exercising a direct grant. So a PUBLIC/anon
-- EXECUTE grant on one is inert today. This is hygiene, not a live
-- exploit closure: removing privileges these functions never needed
-- and can never legitimately use directly.
--
-- LIVE VERIFICATION (this migration is based on the actual current
-- grant state, not carried over from an earlier estimate)
--
-- Queried pg_proc/pg_trigger/aclexplode(proacl) directly against the
-- linked project. There are 27 RETURNS trigger functions in the public
-- schema, all attached to a live trigger (none orphaned/unused). Of
-- those, 23 are SECURITY DEFINER. An earlier audit estimated 25
-- SECURITY DEFINER trigger functions carrying anon/PUBLIC grants —
-- live verification here found the true number is smaller: only 9 of
-- the 23 SECURITY DEFINER trigger functions currently hold any
-- anon/PUBLIC EXECUTE grant at all (the other 14 already have none —
-- e.g. fn_update_vote_score, handle_new_user, notify_chat_message —
-- and are left untouched, matching the instruction not to blindly
-- revoke from every SECURITY DEFINER function). The 4 non-
-- SECURITY-DEFINER trigger functions (assign_founding_member,
-- set_message_window_expiry, set_notification_settings_updated_at,
-- update_updated_at_column) are out of scope for this migration and
-- untouched, per the task's explicit "SECURITY DEFINER functions"
-- framing.
--
-- The 9 functions below are the exact, live-confirmed set: RETURNS
-- trigger, SECURITY DEFINER, attached to a real trigger, no legitimate
-- RPC/client caller (none are invoked directly by any Edge Function or
-- client code — confirmed by repo-wide search), and currently holding
-- an anon and/or PUBLIC EXECUTE grant alongside their (unaffected,
-- left alone) `authenticated` grant. `authenticated` is intentionally
-- NOT revoked here — out of scope per the task brief, which asks only
-- for PUBLIC/anon.
--
-- Per the lesson learned in
-- 20260816010000_phase10_fix_incomplete_anon_revoke.sql: this project
-- has an ALTER DEFAULT PRIVILEGES rule that auto-grants EXECUTE to
-- anon/authenticated/service_role on every newly created function, and
-- every role is implicitly a member of PUBLIC — so anon's grant and
-- PUBLIC's grant are independent and both must be revoked explicitly
-- where present. `postgres` and `service_role` keep EXECUTE
-- unconditionally (admin/bypass roles) and are not touched.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.assign_comment_anon_id() FROM anon;

REVOKE EXECUTE ON FUNCTION public.broadcast_anonymous_chat_message() FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_launch_event_config_for_university() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_launch_event_config_for_university() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.guard_profile_sensitive_columns() FROM anon;

REVOKE EXECUTE ON FUNCTION public.rate_limit_activity_event() FROM anon;

REVOKE EXECUTE ON FUNCTION public.set_admin_action_log_university_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_admin_action_log_university_id() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.set_launch_event_profile_university_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_launch_event_profile_university_id() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.set_user_activity_event_university_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_user_activity_event_university_id() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.trigger_send_push_notification() FROM anon;

COMMIT;
