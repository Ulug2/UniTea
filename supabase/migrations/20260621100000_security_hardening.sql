-- ============================================================
-- Security Hardening: address all Supabase Security Advisor
-- findings from June 2026 audit.
--
-- §1  Revoke EXECUTE on SECURITY DEFINER functions from anon
-- §2  Revoke EXECUTE on trigger-internal functions from anon+authenticated
-- §3  Add is_admin guard to admin-only stat functions
-- §4  Fix mutable search_path on 4 post_stats trigger functions +
--       assign_founding_member + set_message_window_expiry;
--       make those 4 SECURITY DEFINER so they bypass RLS
-- §5  Remove permissive post_stats write policies (replaced by
--       SECURITY DEFINER on the trigger functions)
-- §6  Remove permissive daily_stats_snapshots write policy
--       (service_role bypasses RLS by default — the policy is redundant)
-- §7  Revoke anon SELECT on sensitive tables (hides them from
--       GraphQL schema introspection)
-- §8  Revoke authenticated SELECT on admin-internal tables
-- §9  Narrow storage bucket listing policies
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- §1  Revoke anon EXECUTE on functions meant only for signed-in users
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.delete_user_account()                                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_message_rate_limit(uuid, uuid, integer, integer)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)                FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_community_university_id(uuid)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_is_admin()                                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_match()                                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_university_id()                                  FROM anon;


-- ════════════════════════════════════════════════════════════
-- §2  Trigger-internal functions: revoke from both anon and
--     authenticated.  Triggers fire via DML, not via EXECUTE
--     privilege, so revoking does not break trigger behaviour.
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_upvote_milestone()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_chat_create()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_community_create()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_reports()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_community_university_id()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_post_university_id()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_creator_as_member()          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_founding_member()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_init_post_stats()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_vote_score()           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_comment_count()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_repost_count()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_message_window_expiry()      FROM anon, authenticated;

-- These may have been created via the dashboard rather than a migration:
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_chat_message()              FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_post_engagement_timestamp() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;


-- ════════════════════════════════════════════════════════════
-- §3  Admin-only stat functions: revoke from anon; add explicit
--     is_admin check so a non-admin authenticated caller gets
--     'forbidden' rather than live user data.
--     (The admin dashboard calls these via the authenticated role.)
-- ════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.compute_daily_stats(date)                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_distinct_active_users(text, integer)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_distinct_active_users_action(integer)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_today_dau(timestamp with time zone)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_matchmaking_event()                         FROM anon;

-- reset_matchmaking_event already has the guard; the rest need it added.

CREATE OR REPLACE FUNCTION public.compute_daily_stats(target_date date)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_university_id     uuid;
  v_dau_basic         int;
  v_dau_engaged       int;
  v_dau_action        int;
  v_posts             int;
  v_comments          int;
  v_communities       int;
  v_count             int := 0;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_basic
  FROM user_activity_events
  WHERE event_type = 'session_start' AND occurred_at::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
  FROM user_activity_events
  WHERE event_type = 'engaged_session' AND occurred_at::date = target_date;

  SELECT COUNT(DISTINCT user_id) INTO v_dau_action
  FROM user_activity_events
  WHERE event_type IN ('post_created', 'comment_created', 'community_created')
    AND occurred_at::date = target_date;

  SELECT COUNT(*) INTO v_posts
  FROM posts
  WHERE created_at::date = target_date
    AND (is_deleted IS NULL OR is_deleted = false);

  SELECT COUNT(*) INTO v_comments
  FROM comments
  WHERE created_at::date = target_date
    AND (is_deleted IS NULL OR is_deleted = false);

  SELECT COUNT(*) INTO v_communities
  FROM communities
  WHERE created_at::date = target_date;

  INSERT INTO daily_stats_snapshots
    (snapshot_date, university_id,
     dau_basic, dau_engaged, dau_action,
     posts_created, comments_created, communities_created)
  VALUES
    (target_date, NULL,
     v_dau_basic, v_dau_engaged, v_dau_action,
     v_posts, v_comments, v_communities)
  ON CONFLICT (snapshot_date) WHERE university_id IS NULL
  DO UPDATE SET
    dau_basic           = EXCLUDED.dau_basic,
    dau_engaged         = EXCLUDED.dau_engaged,
    dau_action          = EXCLUDED.dau_action,
    posts_created       = EXCLUDED.posts_created,
    comments_created    = EXCLUDED.comments_created,
    communities_created = EXCLUDED.communities_created,
    computed_at         = now();

  v_count := 1;

  FOR v_university_id IN SELECT id FROM universities
  LOOP
    SELECT COUNT(DISTINCT user_id) INTO v_dau_basic
    FROM user_activity_events
    WHERE event_type = 'session_start'
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_engaged
    FROM user_activity_events
    WHERE event_type = 'engaged_session'
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(DISTINCT user_id) INTO v_dau_action
    FROM user_activity_events
    WHERE event_type IN ('post_created', 'comment_created', 'community_created')
      AND occurred_at::date = target_date
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_posts
    FROM posts
    WHERE created_at::date = target_date
      AND (is_deleted IS NULL OR is_deleted = false)
      AND university_id = v_university_id;

    SELECT COUNT(*) INTO v_comments
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE c.created_at::date = target_date
      AND (c.is_deleted IS NULL OR c.is_deleted = false)
      AND p.university_id = v_university_id;

    SELECT COUNT(*) INTO v_communities
    FROM communities
    WHERE created_at::date = target_date
      AND university_id = v_university_id;

    INSERT INTO daily_stats_snapshots
      (snapshot_date, university_id,
       dau_basic, dau_engaged, dau_action,
       posts_created, comments_created, communities_created)
    VALUES
      (target_date, v_university_id,
       v_dau_basic, v_dau_engaged, v_dau_action,
       v_posts, v_comments, v_communities)
    ON CONFLICT (snapshot_date, university_id) WHERE university_id IS NOT NULL
    DO UPDATE SET
      dau_basic           = EXCLUDED.dau_basic,
      dau_engaged         = EXCLUDED.dau_engaged,
      dau_action          = EXCLUDED.dau_action,
      posts_created       = EXCLUDED.posts_created,
      comments_created    = EXCLUDED.comments_created,
      communities_created = EXCLUDED.communities_created,
      computed_at         = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('computed_date', target_date, 'rows_written', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_distinct_active_users(p_event text, p_days int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE event_type = p_event
      AND occurred_at >= now() - (p_days || ' days')::interval
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.count_distinct_active_users_action(p_days int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE event_type IN ('post_created', 'comment_created', 'community_created')
      AND occurred_at >= now() - (p_days || ' days')::interval
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.count_today_dau(p_since timestamptz)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_activity_events
    WHERE occurred_at >= p_since
      AND event_type = 'session_start'
  );
END;
$$;


-- ════════════════════════════════════════════════════════════
-- §4  Fix mutable search_path + add SECURITY DEFINER to the
--     four post_stats trigger functions so they bypass RLS
--     (prerequisite for removing the permissive write policies
--     in §5).  Also fix assign_founding_member and
--     set_message_window_expiry which only need search_path.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_init_post_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.post_stats (post_id)
  VALUES (NEW.id)
  ON CONFLICT (post_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_vote_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
  v_delta   INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_post_id := NEW.post_id;
    v_delta   := CASE NEW.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END;
  ELSIF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
    v_delta   := CASE OLD.vote_type WHEN 'upvote' THEN -1 WHEN 'downvote' THEN 1 ELSE 0 END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_post_id := NEW.post_id;
    v_delta   :=
        CASE NEW.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END
      - CASE OLD.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END;
  END IF;

  IF v_post_id IS NULL OR v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = v_post_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, vote_score)
  VALUES (v_post_id, v_delta)
  ON CONFLICT (post_id) DO UPDATE
    SET vote_score = public.post_stats.vote_score + EXCLUDED.vote_score;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
  v_delta   INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_deleted IS NOT TRUE THEN
      v_post_id := NEW.post_id;
      v_delta   := 1;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_deleted IS NOT TRUE THEN
      v_post_id := OLD.post_id;
      v_delta   := -1;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.is_deleted IS NOT TRUE) AND (NEW.is_deleted = TRUE) THEN
      v_post_id := NEW.post_id;
      v_delta   := -1;
    ELSIF (OLD.is_deleted = TRUE) AND (NEW.is_deleted IS NOT TRUE) THEN
      v_post_id := NEW.post_id;
      v_delta   := 1;
    END IF;
  END IF;

  IF v_post_id IS NULL OR v_delta IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = v_post_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, comment_count)
  VALUES (v_post_id, GREATEST(0, v_delta))
  ON CONFLICT (post_id) DO UPDATE
    SET comment_count = GREATEST(0, public.post_stats.comment_count + v_delta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_repost_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_id UUID;
  v_delta       INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reposted_from_post_id IS NOT NULL THEN
      v_original_id := NEW.reposted_from_post_id;
      v_delta       := 1;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.reposted_from_post_id IS NOT NULL THEN
      v_original_id := OLD.reposted_from_post_id;
      v_delta       := -1;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.reposted_from_post_id IS DISTINCT FROM NEW.reposted_from_post_id THEN
      IF OLD.reposted_from_post_id IS NOT NULL THEN
        INSERT INTO public.post_stats (post_id, repost_count)
        VALUES (OLD.reposted_from_post_id, 0)
        ON CONFLICT (post_id) DO UPDATE
          SET repost_count = GREATEST(0, public.post_stats.repost_count - 1);
      END IF;
      IF NEW.reposted_from_post_id IS NOT NULL THEN
        INSERT INTO public.post_stats (post_id, repost_count)
        VALUES (NEW.reposted_from_post_id, 1)
        ON CONFLICT (post_id) DO UPDATE
          SET repost_count = public.post_stats.repost_count + 1;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF v_original_id IS NULL OR v_delta IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, repost_count)
  VALUES (v_original_id, GREATEST(0, v_delta))
  ON CONFLICT (post_id) DO UPDATE
    SET repost_count = GREATEST(0, public.post_stats.repost_count + v_delta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_founding_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  founding_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(20260226);

  SELECT COUNT(*) INTO founding_count
  FROM public.profiles
  WHERE is_founding_member = TRUE;

  IF founding_count < 500 THEN
    NEW.is_founding_member := TRUE;
  ELSE
    NEW.is_founding_member := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_message_window_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.viewed_at IS NULL THEN
    NEW.viewed_at := now();
  END IF;
  NEW.window_expires_at := NEW.viewed_at + interval '24 hours';
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- §5  Remove permissive post_stats write policies.
--     The trigger functions now run as SECURITY DEFINER (owner)
--     and bypass RLS entirely, so these broad policies are no
--     longer needed — and their existence allowed any client
--     to write arbitrary rows directly.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "post_stats_delete_trigger" ON public.post_stats;
DROP POLICY IF EXISTS "post_stats_insert_trigger" ON public.post_stats;
DROP POLICY IF EXISTS "post_stats_update_trigger" ON public.post_stats;


-- ════════════════════════════════════════════════════════════
-- §6  Remove the always-true write policy on daily_stats_snapshots.
--     The service_role bypasses RLS by default in Supabase, so
--     the cron/edge function that writes snapshots is unaffected.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role can write snapshots" ON public.daily_stats_snapshots;


-- ════════════════════════════════════════════════════════════
-- §7  Revoke anon SELECT on tables that must not be discoverable
--     in the GraphQL schema without authentication.
--     RLS alone is not enough: even with RLS returning zero rows,
--     the table name and column schema are visible to introspection
--     when anon has SELECT.
-- ════════════════════════════════════════════════════════════

REVOKE SELECT ON TABLE public.admin_action_logs              FROM anon;
REVOKE SELECT ON TABLE public.rate_limits                    FROM anon;
REVOKE SELECT ON TABLE public.reports                        FROM anon;
REVOKE SELECT ON TABLE public.user_activity_events           FROM anon;
REVOKE SELECT ON TABLE public.daily_stats_snapshots          FROM anon;
REVOKE SELECT ON TABLE public.notifications                  FROM anon;
REVOKE SELECT ON TABLE public.notification_settings          FROM anon;
REVOKE SELECT ON TABLE public.blocks                         FROM anon;
REVOKE SELECT ON TABLE public.bookmarks                      FROM anon;
REVOKE SELECT ON TABLE public.chat_messages                  FROM anon;
REVOKE SELECT ON TABLE public.chats                          FROM anon;
REVOKE SELECT ON TABLE public.launch_event_matches           FROM anon;
REVOKE SELECT ON TABLE public.launch_event_message_windows   FROM anon;
REVOKE SELECT ON TABLE public.launch_event_profiles          FROM anon;

REVOKE SELECT ON public.user_chats_summary                   FROM anon;


-- ════════════════════════════════════════════════════════════
-- §8  Revoke authenticated SELECT on rate_limits.
--     admin_action_logs, daily_stats_snapshots, and
--     user_activity_events are read directly by the admin
--     dashboard via the authenticated role; their RLS policies
--     (USING get_my_is_admin()) already restrict row access to
--     admins only, so we keep the table grant but rely on RLS.
--     rate_limits has no admin SELECT policy and must never be
--     readable by regular authenticated users.
-- ════════════════════════════════════════════════════════════

REVOKE SELECT ON TABLE public.rate_limits FROM authenticated;


-- ════════════════════════════════════════════════════════════
-- §9  Storage bucket listing: remove broad SELECT policies that
--     allow any client to enumerate all files.
--     Public buckets still serve individual objects by URL
--     without any SELECT policy, so removing these policies
--     does not break image display.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Allow public read avatars"                     ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars"                       ON storage.objects;
DROP POLICY IF EXISTS "Allow public read chat-images"                 ON storage.objects;
DROP POLICY IF EXISTS "Allow public read post-images"                 ON storage.objects;
-- Dashboard-created catch-all policy with auto-generated suffix:
DROP POLICY IF EXISTS "Full access to authenticated users 1hys5dx_0" ON storage.objects;

-- Users may list only their own folder in each bucket:
CREATE POLICY "Users list own avatar folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars'
         AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users list own post-images folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'post-images'
         AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users list own chat-images folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-images'
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- NOTE (Step 10 — manual): Enable "Leaked Password Protection" in the
-- Supabase Dashboard → Authentication → Settings → Password Security.
-- This cannot be done via a SQL migration.
