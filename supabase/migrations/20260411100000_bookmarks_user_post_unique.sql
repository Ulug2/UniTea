-- One bookmark per user per post (required for PostgREST upsert onConflict).
-- Remove duplicates first so the unique index can be created safely.

DELETE FROM public.bookmarks
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, post_id
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.bookmarks
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_id_post_id_key
  ON public.bookmarks (user_id, post_id);
