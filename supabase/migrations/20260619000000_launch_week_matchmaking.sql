-- ============================================================
-- Launch Week Matchmaking Event
-- ============================================================

-- ── 1. launch_event_config ────────────────────────────────────
-- Single-row table that drives the event lifecycle.
-- Phases: inactive → accepting → locked → revealed

CREATE TABLE public.launch_event_config (
  id    int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phase text NOT NULL CHECK (phase IN ('inactive', 'accepting', 'locked', 'revealed'))
);

INSERT INTO public.launch_event_config (phase) VALUES ('inactive');

ALTER TABLE public.launch_event_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read config"
  ON public.launch_event_config FOR SELECT USING (true);

-- Only admins may update. WITH CHECK prevents changing to an unknown phase
-- (the CHECK constraint on the column already guards this, but belt-and-braces).
CREATE POLICY "Admins can update config"
  ON public.launch_event_config FOR UPDATE
  USING (public.get_my_is_admin())
  WITH CHECK (public.get_my_is_admin());

-- No INSERT or DELETE policies → nobody can add or remove the config row via API.


-- ── 2. launch_event_profiles ──────────────────────────────────
-- One row per participating user. Contains questionnaire answers
-- and temporary demographic fields (purged post-event).

CREATE TABLE public.launch_event_profiles (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id           uuid        NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  gender                  text        NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  -- Temporary demographic fields — purged after the event (see purge edge function)
  display_name            text        NOT NULL,
  major                   text        NOT NULL,
  -- Questionnaire answers: keys are question IDs, values are 0-based option indices
  answers                 jsonb       NOT NULL CHECK (answers <> '{}'::jsonb),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  demographics_purged_at  timestamptz,                             -- set by purge edge function
  UNIQUE(user_id),
  -- Prevent empty / oversized demographic fields at the DB level
  CONSTRAINT display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 50),
  CONSTRAINT major_length        CHECK (char_length(major) BETWEEN 1 AND 100)
);

CREATE INDEX idx_lep_university ON public.launch_event_profiles (university_id);
CREATE INDEX idx_lep_user       ON public.launch_event_profiles (user_id);

ALTER TABLE public.launch_event_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only submit during the 'accepting' phase.
-- The phase check inside WITH CHECK prevents post-deadline submissions
-- even if a client somehow bypasses the UI gate.
CREATE POLICY "Users can insert their own profile during accepting phase"
  ON public.launch_event_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.launch_event_config WHERE phase = 'accepting')
  );

-- Users can only read their own submission (not other users' answers).
CREATE POLICY "Users can read their own profile"
  ON public.launch_event_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all profiles (needed to run the matching algorithm).
CREATE POLICY "Admins can read all profiles"
  ON public.launch_event_profiles FOR SELECT
  USING (public.get_my_is_admin());

-- Admins can update profiles (needed for the demographic purge edge function).
CREATE POLICY "Admins can update profiles"
  ON public.launch_event_profiles FOR UPDATE
  USING (public.get_my_is_admin())
  WITH CHECK (public.get_my_is_admin());

-- No UPDATE policy for regular users → answers are locked on submission.
-- No DELETE policy for anyone via API → rows are only removed via CASCADE on profile delete.


-- ── 3. launch_event_matches ───────────────────────────────────
-- Populated exclusively by the run-matchmaking edge function (service role).
-- Canonical ordering: user_a_id < user_b_id to prevent duplicate pairs.

CREATE TABLE public.launch_event_matches (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       uuid         NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  user_a_id           uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id           uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  compatibility_score numeric(5,2) NOT NULL,
  match_type          text         NOT NULL CHECK (match_type IN ('primary', 'wingman')),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE(user_a_id),
  UNIQUE(user_b_id),
  CHECK (user_a_id < user_b_id)
);

CREATE INDEX idx_lem_user_a     ON public.launch_event_matches (user_a_id);
CREATE INDEX idx_lem_user_b     ON public.launch_event_matches (user_b_id);
CREATE INDEX idx_lem_university ON public.launch_event_matches (university_id);

ALTER TABLE public.launch_event_matches ENABLE ROW LEVEL SECURITY;

-- A user can only see their own match row.
CREATE POLICY "Users can read their own match"
  ON public.launch_event_matches FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Admins can manage matches"
  ON public.launch_event_matches FOR ALL
  USING (public.get_my_is_admin());

-- No INSERT/UPDATE/DELETE for regular users → only the service-role edge function writes here.


-- ── 4. launch_event_message_windows ──────────────────────────
-- Records when a user first views their match reveal.
-- window_expires_at is generated (24 h from viewed_at) and cannot be tampered with.

CREATE TABLE public.launch_event_message_windows (
  user_id           uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id          uuid        NOT NULL REFERENCES public.launch_event_matches(id) ON DELETE CASCADE,
  viewed_at         timestamptz NOT NULL DEFAULT now(),
  window_expires_at timestamptz NOT NULL
);

-- Compute window_expires_at server-side on INSERT so it cannot be tampered with.
-- Equivalent to GENERATED ALWAYS AS (viewed_at + interval '24 hours') but works
-- because timestamptz + interval is not considered immutable by Postgres.
CREATE OR REPLACE FUNCTION public.set_message_window_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.viewed_at IS NULL THEN
    NEW.viewed_at := now();
  END IF;
  NEW.window_expires_at := NEW.viewed_at + interval '24 hours';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_window_expiry
  BEFORE INSERT ON public.launch_event_message_windows
  FOR EACH ROW EXECUTE FUNCTION public.set_message_window_expiry();

ALTER TABLE public.launch_event_message_windows ENABLE ROW LEVEL SECURITY;

-- Users can insert their own window row only during the 'revealed' phase.
CREATE POLICY "Users can insert their own window during revealed phase"
  ON public.launch_event_message_windows FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.launch_event_config WHERE phase = 'revealed')
  );

-- Users can read their own window (to display countdown timer).
CREATE POLICY "Users can read their own window"
  ON public.launch_event_message_windows FOR SELECT
  USING (auth.uid() = user_id);

-- No UPDATE policy for regular users → viewed_at (and therefore window_expires_at)
-- is immutable once set. This prevents a user from resetting their 24 h window.


-- ── 5. get_my_match() — SECURITY DEFINER helper ──────────────
-- Returns the calling user's match row joined with the partner's demographic
-- info from launch_event_profiles. Uses SECURITY DEFINER to safely cross
-- the RLS boundary on launch_event_profiles (users cannot SELECT each other's rows).
-- Partner's user_id IS included so the client can initiate a matchmaking chat.

CREATE OR REPLACE FUNCTION public.get_my_match()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_result   jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'id',                  m.id,
    'university_id',       m.university_id,
    'user_a_id',           m.user_a_id,
    'user_b_id',           m.user_b_id,
    'compatibility_score', m.compatibility_score,
    'match_type',          m.match_type,
    'created_at',          m.created_at,
    'partner', jsonb_build_object(
      'user_id',      p.user_id,
      'display_name', p.display_name,
      'major',        p.major,
      'gender',       p.gender
    )
  )
  INTO v_result
  FROM launch_event_matches m
  JOIN launch_event_profiles p
    ON p.user_id = CASE
      WHEN m.user_a_id = v_user_id THEN m.user_b_id
      ELSE m.user_a_id
    END
  WHERE m.user_a_id = v_user_id OR m.user_b_id = v_user_id
  LIMIT 1;

  RETURN v_result;
END;
$$;
