-- ============================================================
-- Migration: post_stats denormalised table + trigger maintenance
--
-- Replaces 3 of the 4 correlated subqueries in posts_summary_view
-- (comment_count, vote_score, repost_count) with a simple LEFT JOIN.
-- A generated column hot_score = ABS(vote_score) + comment_count + repost_count
-- lets the "hot" feed sort server-side on an indexed column instead of
-- fetching 100 rows and sorting in JavaScript.
--
-- user_vote is session-specific (auth.uid()) and cannot be precomputed,
-- so it stays as the only remaining subquery in the view.
-- ============================================================


-- ── 1. post_stats table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.post_stats (
  post_id       UUID    NOT NULL PRIMARY KEY
                        REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_count INT     NOT NULL DEFAULT 0,
  vote_score    INT     NOT NULL DEFAULT 0,
  repost_count  INT     NOT NULL DEFAULT 0,
  -- Stored generated column: updated automatically whenever the other columns change.
  -- Used as the sort key for the "hot" feed.
  hot_score     INT     GENERATED ALWAYS AS
                          (ABS(vote_score) + comment_count + repost_count) STORED
);

-- Index used by the "hot" feed ORDER BY hot_score DESC
CREATE INDEX IF NOT EXISTS idx_post_stats_hot_score
  ON public.post_stats (hot_score DESC);

-- RLS: only the service role and authenticated reads are needed.
-- The table is maintained exclusively by triggers, never by client code.
ALTER TABLE public.post_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_stats_select_authenticated"
  ON public.post_stats FOR SELECT
  USING (true);


-- ── 2. Trigger: initialise a post_stats row when a post is created ───────────

CREATE OR REPLACE FUNCTION public.fn_init_post_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.post_stats (post_id)
  VALUES (NEW.id)
  ON CONFLICT (post_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_post_stats ON public.posts;
CREATE TRIGGER trg_init_post_stats
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.fn_init_post_stats();


-- ── 3. Trigger: keep vote_score in sync with the votes table ─────────────────

CREATE OR REPLACE FUNCTION public.fn_update_vote_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_post_id UUID;
  v_delta   INT;
BEGIN
  -- Determine which post_id is affected and the net score delta.
  IF TG_OP = 'INSERT' THEN
    v_post_id := NEW.post_id;
    v_delta   := CASE NEW.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END;

  ELSIF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
    v_delta   := CASE OLD.vote_type WHEN 'upvote' THEN -1 WHEN 'downvote' THEN 1 ELSE 0 END;

  ELSIF TG_OP = 'UPDATE' THEN
    -- vote_type changed (e.g. upvote → downvote or vote removed/re-added)
    v_post_id := NEW.post_id;
    v_delta   :=
        CASE NEW.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END
      - CASE OLD.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END;
  END IF;

  -- Only act on post votes (comment votes have post_id = NULL)
  IF v_post_id IS NULL OR v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, vote_score)
  VALUES (v_post_id, v_delta)
  ON CONFLICT (post_id) DO UPDATE
    SET vote_score = public.post_stats.vote_score + EXCLUDED.vote_score;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_vote_score ON public.votes;
CREATE TRIGGER trg_update_vote_score
  AFTER INSERT OR UPDATE OF vote_type OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_vote_score();


-- ── 4. Trigger: keep comment_count in sync with the comments table ───────────

CREATE OR REPLACE FUNCTION public.fn_update_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_post_id UUID;
  v_delta   INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only count non-deleted inserts
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
    -- Soft-delete: is_deleted flipped false → true
    IF (OLD.is_deleted IS NOT TRUE) AND (NEW.is_deleted = TRUE) THEN
      v_post_id := NEW.post_id;
      v_delta   := -1;
    -- Un-delete: is_deleted flipped true → false
    ELSIF (OLD.is_deleted = TRUE) AND (NEW.is_deleted IS NOT TRUE) THEN
      v_post_id := NEW.post_id;
      v_delta   := 1;
    END IF;
  END IF;

  IF v_post_id IS NULL OR v_delta IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, comment_count)
  VALUES (v_post_id, GREATEST(0, v_delta))
  ON CONFLICT (post_id) DO UPDATE
    SET comment_count = GREATEST(0, public.post_stats.comment_count + v_delta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_comment_count ON public.comments;
CREATE TRIGGER trg_update_comment_count
  AFTER INSERT OR UPDATE OF is_deleted OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_comment_count();


-- ── 5. Trigger: keep repost_count in sync with the posts table ───────────────

CREATE OR REPLACE FUNCTION public.fn_update_repost_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    -- reposted_from_post_id changed (edge case, but handle it)
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

DROP TRIGGER IF EXISTS trg_update_repost_count ON public.posts;
CREATE TRIGGER trg_update_repost_count
  AFTER INSERT OR UPDATE OF reposted_from_post_id OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_repost_count();


-- ── 6. Backfill: populate post_stats for all existing posts ──────────────────

INSERT INTO public.post_stats (post_id, comment_count, vote_score, repost_count)
SELECT
  p.id AS post_id,

  COALESCE((
    SELECT COUNT(*)::int
    FROM public.comments c
    WHERE c.post_id = p.id
      AND (c.is_deleted IS NULL OR c.is_deleted = FALSE)
  ), 0) AS comment_count,

  COALESCE((
    SELECT SUM(CASE
      WHEN v.vote_type = 'upvote'   THEN  1
      WHEN v.vote_type = 'downvote' THEN -1
      ELSE 0
    END)::int
    FROM public.votes v
    WHERE v.post_id = p.id
  ), 0) AS vote_score,

  COALESCE((
    SELECT COUNT(*)::int
    FROM public.posts r
    WHERE r.reposted_from_post_id = p.id
  ), 0) AS repost_count

FROM public.posts p
ON CONFLICT (post_id) DO UPDATE
  SET comment_count = EXCLUDED.comment_count,
      vote_score    = EXCLUDED.vote_score,
      repost_count  = EXCLUDED.repost_count;


-- ── 7. Recreate posts_summary_view using post_stats JOIN ─────────────────────
-- Drop first — CREATE OR REPLACE VIEW cannot add columns to an existing view.

DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,
    p.user_id,
    p.content,
    p.title,
    p.image_url,
    p.category,
    p.location,
    p.post_type,
    p.is_anonymous,
    p.is_deleted,
    p.is_edited,
    p.created_at,
    p.updated_at,
    p.edited_at,
    p.view_count,
    p.repost_comment,
    p.reposted_from_post_id,

    pr.username,
    pr.avatar_url,
    pr.is_verified,
    pr.is_banned,

    -- Stats from the denormalised table (simple JOIN, no subqueries)
    COALESCE(ps.comment_count, 0) AS comment_count,
    COALESCE(ps.vote_score,    0) AS vote_score,
    COALESCE(ps.repost_count,  0) AS repost_count,
    COALESCE(ps.hot_score,     0) AS hot_score,

    -- user_vote must remain a subquery — it is session-specific (auth.uid())
    (
        SELECT v.vote_type
        FROM public.votes v
        WHERE v.post_id = p.id
          AND v.user_id = auth.uid()
        LIMIT 1
    ) AS user_vote,

    -- Original post fields (populated only for reposts)
    op.id              AS original_post_id,
    op.content         AS original_content,
    op.user_id         AS original_user_id,
    opr.username       AS original_author_username,
    opr.avatar_url     AS original_author_avatar,
    op.image_url       AS original_image_url,
    op.is_anonymous    AS original_is_anonymous,
    op.created_at      AS original_created_at

FROM public.posts p
JOIN  public.profiles pr  ON p.user_id              = pr.id
LEFT JOIN public.post_stats ps  ON ps.post_id        = p.id
LEFT JOIN public.posts op       ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr   ON op.user_id        = opr.id

WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL;
