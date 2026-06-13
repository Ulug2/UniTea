BEGIN;

-- ============================================================
-- Migration: Communities feature — schema, indexes, triggers,
--            and posts_summary_view rebuild.
--
-- University-scoped communities that users can join. Posts may
-- optionally belong to a community (community_id IS NULL == the
-- public "Campus Feed"). RLS is applied in the companion
-- migration 20260612120001_communities_rls.sql.
-- ============================================================

-- 1. communities table
CREATE TABLE IF NOT EXISTS public.communities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  description   text,
  avatar_url    text,
  university_id uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate community names within the same university
-- (case-insensitive) so the directory stays unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_communities_university_name
  ON public.communities (university_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_communities_university_id
  ON public.communities (university_id);

-- 2. community_members table (composite PK)
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- Lookups for "communities I have joined".
CREATE INDEX IF NOT EXISTS idx_community_members_user_id
  ON public.community_members (user_id);

-- Enable RLS immediately so the tables are never exposed before the policy
-- migration (20260612120001) runs. With RLS on and no policies yet, the
-- default is deny-all — safe by construction.
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- 3. posts.community_id (nullable). Deleting a community deletes its
--    posts (CASCADE) so community-scoped content never leaks into the
--    public Campus Feed.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS community_id uuid
  REFERENCES public.communities(id) ON DELETE CASCADE;

-- 4. Scale-critical partial indexes matching the exact feed predicates.
--    Community feeds: filter by community_id, sort by created_at.
CREATE INDEX IF NOT EXISTS idx_posts_community_feed
  ON public.posts (community_id, created_at DESC)
  WHERE post_type = 'feed' AND is_deleted = false AND community_id IS NOT NULL;

--    Campus feed: community_id IS NULL, scoped per university, sort by created_at.
CREATE INDEX IF NOT EXISTS idx_posts_campus_feed
  ON public.posts (university_id, created_at DESC)
  WHERE post_type = 'feed' AND is_deleted = false AND community_id IS NULL;

-- 5. Trigger: fill communities.university_id from the creator's profile
--    on INSERT. Never trust a client-provided value.
CREATE OR REPLACE FUNCTION public.set_community_university_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT university_id INTO NEW.university_id
    FROM public.profiles
   WHERE id = NEW.created_by;

  IF NEW.university_id IS NULL THEN
    RAISE EXCEPTION 'Creator profile has no university_id (created_by=%)', NEW.created_by
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_community_university_id ON public.communities;
CREATE TRIGGER trg_set_community_university_id
  BEFORE INSERT ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_community_university_id();

-- 6. Trigger: auto-join the creator as the first member.
CREATE OR REPLACE FUNCTION public.add_creator_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_creator_as_member ON public.communities;
CREATE TRIGGER trg_add_creator_as_member
  AFTER INSERT ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_member();

-- 7. RLS helper: a community's university, resolved with definer rights
--    so policies don't recurse and aren't re-evaluated row-by-row.
CREATE OR REPLACE FUNCTION public.get_community_university_id(p_community_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT university_id FROM public.communities WHERE id = p_community_id;
$$;

-- 8. Rebuild posts_summary_view to expose community_id.
--    Must DROP + CREATE (not CREATE OR REPLACE) to add a column.
--    Mirrors the latest definition from 20260609120000_universities_multitenancy.sql.
DROP VIEW IF EXISTS public.posts_summary_view;

CREATE VIEW public.posts_summary_view AS
SELECT
    p.id                      AS post_id,
    p.user_id,
    p.content,
    p.title,
    p.image_url,
    p.image_urls,
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
    p.university_id,
    p.community_id,

    pr.username,
    pr.avatar_url,
    pr.is_verified,
    pr.is_banned,

    COALESCE(ps.comment_count, 0) AS comment_count,
    COALESCE(ps.vote_score,    0) AS vote_score,
    COALESCE(ps.repost_count,  0) AS repost_count,
    CAST(
      (
        (
          ABS(COALESCE(ps.vote_score, 0))
          + COALESCE(ps.comment_count, 0) * 2
          + COALESCE(ps.repost_count, 0) * 3
        ) * 1000
      )
      /
      POWER(
        (
          GREATEST(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(p.created_at, NOW()))) / 3600.0,
            0
          ) + 2
        ),
        1.3
      )
      AS INTEGER
    ) AS hot_score,

    (
        SELECT v.vote_type
        FROM public.votes v
        WHERE v.post_id = p.id
          AND v.user_id = auth.uid()
        LIMIT 1
    ) AS user_vote,

    op.id              AS original_post_id,
    op.content         AS original_content,
    op.user_id         AS original_user_id,
    opr.username       AS original_author_username,
    opr.avatar_url     AS original_author_avatar,
    op.image_url       AS original_image_url,
    op.image_urls      AS original_image_urls,
    op.is_anonymous    AS original_is_anonymous,
    op.created_at      AS original_created_at,
    op.title           AS original_title,

    p.image_aspect_ratio,
    op.image_aspect_ratio AS original_image_aspect_ratio

FROM public.posts p
JOIN  public.profiles pr       ON p.user_id = pr.id
LEFT JOIN public.post_stats ps ON ps.post_id = p.id
LEFT JOIN public.posts op      ON p.reposted_from_post_id = op.id
LEFT JOIN public.profiles opr  ON op.user_id = opr.id

WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL;

ALTER VIEW public.posts_summary_view SET (security_invoker = true);
REVOKE ALL ON public.posts_summary_view FROM PUBLIC;
GRANT SELECT ON public.posts_summary_view TO authenticated;

COMMIT;
