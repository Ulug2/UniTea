BEGIN;

-- Update community field limits to 50 (name) and 300 (description).

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_name_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_name_check
  CHECK (char_length(name) BETWEEN 2 AND 50);

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_description_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_description_check
  CHECK (description IS NULL OR char_length(description) <= 300);

COMMIT;
