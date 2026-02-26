-- ============================================================
-- Migration: Add "Founding Father" badge logic to profiles
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add the column
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN NOT NULL DEFAULT FALSE;

-- ────────────────────────────────────────────────────────────
-- 2. Back-fill: award the badge to the earliest existing users
--    (up to 500, ordered by created_at ASC).
-- ────────────────────────────────────────────────────────────
UPDATE public.profiles
SET    is_founding_member = TRUE
WHERE  id IN (
  SELECT id
  FROM   public.profiles
  ORDER  BY created_at ASC
  LIMIT  500
);

-- ────────────────────────────────────────────────────────────
-- 3. Trigger function: award the badge to new sign-ups until
--    exactly 500 founding members exist.
--
--    A transaction-level advisory lock (pg_advisory_xact_lock)
--    serialises concurrent INSERT transactions so that two
--    simultaneous sign-ups cannot both read count < 500 and
--    both receive the badge, preventing a race condition.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_founding_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  founding_count INTEGER;
BEGIN
  -- Serialise concurrent inserts using a fixed advisory lock key.
  -- Any concurrent transaction attempting the same INSERT on
  -- profiles will block here until this transaction commits.
  PERFORM pg_advisory_xact_lock(20260226);

  SELECT COUNT(*) INTO founding_count
  FROM   public.profiles
  WHERE  is_founding_member = TRUE;

  IF founding_count < 500 THEN
    NEW.is_founding_member := TRUE;
  ELSE
    NEW.is_founding_member := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Attach the trigger (BEFORE INSERT so we set the value
--    before the row is written to disk).
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_assign_founding_member ON public.profiles;

CREATE TRIGGER trg_assign_founding_member
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_founding_member();
