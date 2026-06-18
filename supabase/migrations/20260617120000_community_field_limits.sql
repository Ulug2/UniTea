BEGIN;

-- Enforce community name (25) and description (200) length limits at the DB layer.

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_name_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_name_check
  CHECK (char_length(name) BETWEEN 2 AND 25);

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_description_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_description_check
  CHECK (description IS NULL OR char_length(description) <= 200);

COMMIT;
