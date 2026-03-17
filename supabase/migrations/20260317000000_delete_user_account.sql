-- ============================================================
-- Migration: Reliable account deletion
--
-- Adds:
--   - FK cascades / set-null behavior for user-owned data
--   - `public.delete_user_account()` RPC for self-service deletion
--
-- Goal:
--   Let a user delete their own account even if they have existing
--   posts/votes/chats/etc, without foreign-key violations.
-- ============================================================

-- ── FK behavior for user deletion ─────────────────────────────
-- When deleting auth.users(id), remove user-owned rows or detach references.

-- profiles: remove profile row when auth user is deleted
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey,
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- posts: deleting user deletes their posts (and dependent rows cascade via other migrations)
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_user_id_fkey,
  ADD CONSTRAINT posts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- comments: keep comment row but detach author if user is deleted
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey,
  ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- votes/bookmarks/blocks/notification settings/notifications: user-owned, delete with user
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_user_id_fkey,
  ADD CONSTRAINT votes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_user_id_fkey,
  ADD CONSTRAINT bookmarks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blocks
  DROP CONSTRAINT IF EXISTS blocks_blocker_id_fkey,
  ADD CONSTRAINT blocks_blocker_id_fkey
    FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blocks
  DROP CONSTRAINT IF EXISTS blocks_blocked_id_fkey,
  ADD CONSTRAINT blocks_blocked_id_fkey
    FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_user_id_fkey,
  ADD CONSTRAINT notification_settings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- If a referenced user is deleted, keep notification but clear the reference
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_related_user_id_fkey,
  ADD CONSTRAINT notifications_related_user_id_fkey
    FOREIGN KEY (related_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- chats: deleting either participant deletes the chat (messages cascade via chat_id)
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_participant_1_id_fkey,
  ADD CONSTRAINT chats_participant_1_id_fkey
    FOREIGN KEY (participant_1_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_participant_2_id_fkey,
  ADD CONSTRAINT chats_participant_2_id_fkey
    FOREIGN KEY (participant_2_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- chat messages: also cascade by user_id (belt-and-suspenders)
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey,
  ADD CONSTRAINT chat_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- reports:
-- - reporter_id is NOT NULL in this schema, so we must delete reports filed by the user
-- - reviewed_by is nullable, keep history but detach reviewer reference
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reviewed_by_fkey,
  ADD CONSTRAINT reports_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- poll_votes references profiles(id) (not auth.users) — cascade when profile is deleted
ALTER TABLE public.poll_votes
  DROP CONSTRAINT IF EXISTS poll_votes_user_id_fkey,
  ADD CONSTRAINT poll_votes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- admin_action_logs: keep history, detach deleted users
ALTER TABLE public.admin_action_logs
  DROP CONSTRAINT IF EXISTS admin_action_logs_target_user_id_fkey,
  ADD CONSTRAINT admin_action_logs_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── RPC: delete own account ───────────────────────────────────
-- This function:
--   - validates caller is authenticated
--   - deletes from auth.users (cascades will remove dependent public rows)
-- Notes:
--   - SECURITY DEFINER required to delete from auth schema
--   - search_path pinned to avoid hijacking

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete the auth user. FK cascades handle dependent public rows.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

