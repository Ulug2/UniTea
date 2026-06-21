-- ============================================================
-- Security Hardening Part 2: revoke EXECUTE from PUBLIC.
--
-- The previous migration revoked from the `anon` and
-- `authenticated` roles, but PostgreSQL auto-grants EXECUTE
-- to PUBLIC when a function is created.  Revoking from
-- specific roles leaves the PUBLIC grant intact, so both
-- roles still got EXECUTE through it.
--
-- Fix: REVOKE FROM PUBLIC, then GRANT back only to the roles
-- that legitimately need each function.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- Functions that only authenticated users should call
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.delete_user_account()                                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_message_rate_limit(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_community_university_id(uuid)                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_is_admin()                                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_match()                                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_university_id()                                 FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_user_account()                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_message_rate_limit(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_university_id(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_is_admin()                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_match()                                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_university_id()                                 TO authenticated;


-- ════════════════════════════════════════════════════════════
-- Admin-only functions: remove PUBLIC, grant to authenticated
-- (the function body itself raises 'forbidden' for non-admins)
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.compute_daily_stats(date)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_distinct_active_users(text, integer)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_distinct_active_users_action(integer)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_today_dau(timestamp with time zone)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_matchmaking_event()                        FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.compute_daily_stats(date)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_active_users(text, integer)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_active_users_action(integer)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_today_dau(timestamp with time zone)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_matchmaking_event()                        TO authenticated;


-- ════════════════════════════════════════════════════════════
-- Trigger-internal functions: revoke from PUBLIC entirely —
-- no role needs to call these via RPC
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_upvote_milestone()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_limit_chat_create()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_limit_community_create()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_limit_reports()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_community_university_id()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_post_university_id()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_creator_as_member()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_founding_member()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_init_post_stats()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_vote_score()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_comment_count()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_update_repost_count()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_message_window_expiry()    FROM PUBLIC;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_chat_message()              FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_post_engagement_timestamp() FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
