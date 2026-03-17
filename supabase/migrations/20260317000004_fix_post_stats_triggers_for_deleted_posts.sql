-- ============================================================
-- Migration: Prevent post_stats FK violations during cascades
--
-- Root cause:
-- - Deleting a user cascades deletes across posts/votes/comments.
-- - The votes/comments triggers upsert into post_stats.
-- - If the post is already deleted in the same transaction, the upsert
--   violates post_stats(post_id) -> posts(id) FK.
--
-- Fix:
-- - Guard the trigger functions: if the post no longer exists, no-op.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_vote_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
    v_post_id := NEW.post_id;
    v_delta   :=
        CASE NEW.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END
      - CASE OLD.vote_type WHEN 'upvote' THEN 1 WHEN 'downvote' THEN -1 ELSE 0 END;
  END IF;

  -- Only act on post votes (comment votes have post_id = NULL)
  IF v_post_id IS NULL OR v_delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- If the post is already deleted (e.g. cascade during user deletion), no-op.
  IF NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = v_post_id) THEN
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

  -- If the post is already deleted (e.g. cascade during user deletion), no-op.
  IF NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = v_post_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.post_stats (post_id, comment_count)
  VALUES (v_post_id, GREATEST(0, v_delta))
  ON CONFLICT (post_id) DO UPDATE
    SET comment_count = GREATEST(0, public.post_stats.comment_count + v_delta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

