BEGIN;

-- ============================================================
-- Step 1: Multi-university isolation — schema, backfill,
--         triggers, and view update.
--
-- This migration MUST be applied atomically. It:
--   1. Creates the universities lookup table.
--   2. Seeds Nazarbayev University and SDU.
--   3. Adds university_id FK to profiles and posts (nullable).
--   4. Backfills all existing rows to Nazarbayev University.
--   5. Enforces NOT NULL + adds indexes.
--   6. Creates helper functions for RLS.
--   7. Adds a BEFORE INSERT trigger on posts to auto-set
--      university_id from the author's profile.
--   8. Updates handle_new_user() to parse email domain and
--      assign university_id (rejects unsupported domains).
--   9. Rebuilds posts_summary_view to expose university_id.
-- ============================================================

-- 1. universities table
CREATE TABLE IF NOT EXISTS public.universities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  domain     text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read universities" ON public.universities;
CREATE POLICY "Authenticated can read universities"
  ON public.universities FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Seed initial universities
INSERT INTO public.universities (name, domain) VALUES
  ('Nazarbayev University', 'nu.edu.kz'),
  ('SDU University',        'stu.sdu.edu.kz')
ON CONFLICT (domain) DO NOTHING;

-- 3. Add nullable FK columns (nullable so the backfill can run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id);
ALTER TABLE public.posts    ADD COLUMN IF NOT EXISTS university_id uuid REFERENCES public.universities(id);

-- 4. Backfill all existing rows -> Nazarbayev University
UPDATE public.profiles
   SET university_id = (SELECT id FROM public.universities WHERE domain = 'nu.edu.kz')
 WHERE university_id IS NULL;

UPDATE public.posts
   SET university_id = (SELECT id FROM public.universities WHERE domain = 'nu.edu.kz')
 WHERE university_id IS NULL;

-- 5. Enforce NOT NULL after backfill + add indexes
ALTER TABLE public.profiles ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.posts    ALTER COLUMN university_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_university_id ON public.profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_posts_university_id    ON public.posts(university_id);

-- 6. Helper: returns the current authenticated user's university_id.
--    SECURITY DEFINER so it can read profiles without triggering RLS
--    recursion when used inside profiles RLS policies.
CREATE OR REPLACE FUNCTION public.get_my_university_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT university_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 7. Auto-fill posts.university_id from author's profile on INSERT.
--    Keeps the create-post edge function unchanged — it never sends
--    university_id, so the trigger fills it from the author's profile.
CREATE OR REPLACE FUNCTION public.set_post_university_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.university_id IS NULL THEN
    SELECT university_id INTO NEW.university_id
      FROM public.profiles
     WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_post_university_id ON public.posts;
CREATE TRIGGER trg_set_post_university_id
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_post_university_id();

-- 8. Update handle_new_user(): parse email domain, look up
--    university, inject university_id into profiles row.
--    Rejects unsupported domains with a check_violation so the
--    auth.users INSERT is rolled back and signup fails gracefully.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_domain        text;
  v_university_id uuid;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));

  SELECT id INTO v_university_id
    FROM public.universities
   WHERE domain = v_domain;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'University not supported for domain %', v_domain
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, username, avatar_url, university_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    v_university_id
  );
  RETURN NEW;
END;
$$;

-- 9. Rebuild posts_summary_view with university_id exposed.
--    Must DROP + CREATE (not CREATE OR REPLACE) because we are
--    adding a column — Postgres cannot drop/reorder columns in
--    an existing view via CREATE OR REPLACE.
--    Preserves all columns from the latest live view definition
--    (including image_aspect_ratio from migration 20260409).
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
