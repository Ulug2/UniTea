-- ============================================================
-- Phase 4 — University-Isolated Matchmaking
-- ============================================================
-- Audit (Phase 4, read-only) found the entire matchmaking system had no
-- university isolation: launch_event_config was a single global row driving
-- one phase for every university at once; launch_event_profiles/matches had
-- unscoped `get_my_is_admin()` admin policies letting any admin read/write
-- every university's data directly via REST; and launch_event_profiles had
-- no server-side check that a submitted university_id matched the
-- submitter's real university. This migration closes all three.

-- ── 1. launch_event_config → per-university ───────────────────
-- Was a single row pinned to id=1 (CHECK(id=1)). Becomes one row per
-- university, keyed on university_id, so SDU and NU can have independent
-- phases. The existing row is inactive with zero downstream matchmaking
-- data (verified live before writing this migration), so it's safe to
-- reseed per-university rather than trying to preserve which university
-- "owned" the old singleton row.

DROP POLICY IF EXISTS "Anyone can read config" ON public.launch_event_config;
DROP POLICY IF EXISTS "Admins can update config" ON public.launch_event_config;

ALTER TABLE public.launch_event_config DROP CONSTRAINT launch_event_config_pkey;
ALTER TABLE public.launch_event_config DROP CONSTRAINT launch_event_config_id_check;
ALTER TABLE public.launch_event_config DROP COLUMN id;

ALTER TABLE public.launch_event_config
  ADD COLUMN university_id uuid REFERENCES public.universities(id) ON DELETE CASCADE;

DELETE FROM public.launch_event_config;

INSERT INTO public.launch_event_config (university_id, phase)
SELECT id, 'inactive' FROM public.universities;

ALTER TABLE public.launch_event_config ALTER COLUMN university_id SET NOT NULL;
ALTER TABLE public.launch_event_config ADD CONSTRAINT launch_event_config_pkey PRIMARY KEY (university_id);

-- Every university must always have exactly one config row (client code and
-- the SECURITY DEFINER reset function both assume this), so newly created
-- universities are auto-provisioned with an 'inactive' row. No INSERT/DELETE
-- RLS policy is granted to anyone — same "no manual insert" posture the
-- table already had — this trigger is the only way rows come into existence
-- beyond this migration's own backfill above.
CREATE OR REPLACE FUNCTION public.create_launch_event_config_for_university()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.launch_event_config (university_id, phase)
  VALUES (NEW.id, 'inactive')
  ON CONFLICT (university_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_launch_event_config_for_university
  AFTER INSERT ON public.universities
  FOR EACH ROW EXECUTE FUNCTION public.create_launch_event_config_for_university();

-- Read: authenticated users only see their own university's phase — the
-- table already had SELECT REVOKEd from anon (20260621100000), so this
-- policy governs authenticated visibility. Previously "true" was safe only
-- because a single global row carried no per-university information; now
-- that a row *is* per-university information, scope it.
CREATE POLICY "Users can read their own university's config"
  ON public.launch_event_config FOR SELECT
  USING (university_id = public.get_my_university_id());

-- Write: admin, scoped to their own university's row only.
CREATE POLICY "Admins can update their own university's config"
  ON public.launch_event_config FOR UPDATE
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  WITH CHECK (public.get_my_is_admin() AND university_id = public.get_my_university_id());


-- ── 2. launch_event_profiles: prevent university spoofing on submission ──
-- Mirrors the existing set_post_university_id() pattern (posts,
-- 20260805000002): a BEFORE INSERT trigger unconditionally derives
-- university_id from the submitter's own profile, discarding whatever the
-- client sent. The RLS WITH CHECK below is an independent backstop that
-- re-checks the same invariant, matching the two-layer approach already
-- established for posts.
CREATE OR REPLACE FUNCTION public.set_launch_event_profile_university_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT university_id INTO NEW.university_id
    FROM public.profiles
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_launch_event_profile_university_id
  BEFORE INSERT ON public.launch_event_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_launch_event_profile_university_id();

DROP POLICY IF EXISTS "Users can insert their own profile during accepting phase" ON public.launch_event_profiles;
CREATE POLICY "Users can insert their own profile during accepting phase"
  ON public.launch_event_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    -- Backstop: even if the trigger above were ever altered or bypassed,
    -- a submission still cannot claim a university other than the
    -- submitter's own.
    AND university_id = (SELECT p.university_id FROM public.profiles p WHERE p.id = user_id)
    AND EXISTS (
      SELECT 1 FROM public.launch_event_config c
      WHERE c.phase = 'accepting' AND c.university_id = launch_event_profiles.university_id
    )
  );

-- ── 3. launch_event_profiles: scope admin bypass to own university ──
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.launch_event_profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.launch_event_profiles FOR SELECT
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id());

DROP POLICY IF EXISTS "Admins can update profiles" ON public.launch_event_profiles;
CREATE POLICY "Admins can update profiles"
  ON public.launch_event_profiles FOR UPDATE
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  WITH CHECK (public.get_my_is_admin() AND university_id = public.get_my_university_id());


-- ── 4. launch_event_matches: replace unscoped FOR ALL with scoped policies ──
-- The prior "Admins can manage matches" policy was `FOR ALL USING
-- (get_my_is_admin())` with no explicit WITH CHECK, meaning Postgres reused
-- the same unscoped USING clause for INSERT/UPDATE too — any admin could
-- read AND write any university's matches directly via REST. Split into
-- explicit per-command policies so each is independently auditable.
DROP POLICY IF EXISTS "Admins can manage matches" ON public.launch_event_matches;

CREATE POLICY "Admins can select matches in their university"
  ON public.launch_event_matches FOR SELECT
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id());

CREATE POLICY "Admins can insert matches in their university"
  ON public.launch_event_matches FOR INSERT
  WITH CHECK (public.get_my_is_admin() AND university_id = public.get_my_university_id());

CREATE POLICY "Admins can update matches in their university"
  ON public.launch_event_matches FOR UPDATE
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id())
  WITH CHECK (public.get_my_is_admin() AND university_id = public.get_my_university_id());

CREATE POLICY "Admins can delete matches in their university"
  ON public.launch_event_matches FOR DELETE
  USING (public.get_my_is_admin() AND university_id = public.get_my_university_id());

-- launch_event_message_windows: no admin bypass is added here (only owner
-- read/insert), which is correct and stays as-is. Its INSERT policy's phase
-- gate does need updating though — it currently does
-- `EXISTS (SELECT 1 FROM launch_event_config WHERE phase = 'revealed')`
-- with no filter, which was fine against a single global row but would now
-- incorrectly pass if *any* university had been revealed, not just the
-- caller's own. Scope it to the caller's own university's config row.
DROP POLICY IF EXISTS "Users can insert their own window during revealed phase" ON public.launch_event_message_windows;
CREATE POLICY "Users can insert their own window during revealed phase"
  ON public.launch_event_message_windows FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.launch_event_config c
      WHERE c.phase = 'revealed' AND c.university_id = public.get_my_university_id()
    )
  );


-- ── 5. reset_matchmaking_event(): TRUNCATE → university-scoped DELETE ──
-- TRUNCATE cannot take a WHERE clause, so it could never be made
-- university-scoped — it had to become DELETE. SECURITY DEFINER means this
-- function bypasses RLS entirely, so the university boundary must be
-- enforced explicitly in the function body, not left to caller RLS.
CREATE OR REPLACE FUNCTION public.reset_matchmaking_event()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_university_id uuid;
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_university_id := get_my_university_id();
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: caller has no resolvable university';
  END IF;

  -- FK-safe order: windows (resolved via profiles in this university,
  -- since the table has no university_id of its own) → matches → profiles.
  DELETE FROM launch_event_message_windows
   WHERE user_id IN (
     SELECT user_id FROM launch_event_profiles WHERE university_id = v_university_id
   );

  DELETE FROM launch_event_matches WHERE university_id = v_university_id;
  DELETE FROM launch_event_profiles WHERE university_id = v_university_id;

  UPDATE launch_event_config SET phase = 'inactive' WHERE university_id = v_university_id;

  INSERT INTO admin_action_logs (admin_id, action, metadata)
  VALUES (auth.uid(), 'reset_matchmaking', jsonb_build_object('university_id', v_university_id));

  RETURN jsonb_build_object('ok', true, 'university_id', v_university_id);
END;
$$;
