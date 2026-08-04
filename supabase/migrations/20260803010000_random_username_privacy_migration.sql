-- ============================================================
-- Phase 7.6.1 — Random username privacy migration
-- ============================================================
--
-- ROOT CAUSE (Phase 7.6 audit): handle_new_user() has always assigned
-- every new user's username as split_part(NEW.email, '@', 1) — the local
-- part of their university email address — because the client's signup
-- call (useAuthFlow.ts's supabase.auth.signUp()) never sends a username
-- in raw_user_meta_data, so the COALESCE fallback is hit unconditionally,
-- for every signup, with no exception. Since many university email
-- conventions are firstname.lastname@ or similar, this can mean a
-- student's real name is shown to every other student by default,
-- everywhere a username is displayed (feed, comments, chat,
-- notifications), with zero prompt to change it.
--
-- FIX (this migration):
--   1. generate_random_username(): a curated adjective+noun+3-digit-number
--      generator (e.g. BlueFalcon482), collision-checked against the live
--      profiles table with bounded retry. No email/name/timestamp/UUID
--      input of any kind.
--   2. is_valid_username(): shared format check (3-20 chars,
--      letters/numbers/underscore only), used both by the trigger (to
--      validate an optional client-supplied username) and as a CHECK
--      constraint on profiles.username itself, so the constraint is
--      enforced no matter which code path writes to the column —
--      including the pre-existing direct client UPDATE in
--      useUpdateProfile.ts, which had zero server-side validation before
--      this migration.
--   3. Backfill: every existing profile's username is replaced with a
--      freshly generated random one. Deliberately never reads
--      auth.users.email anywhere in this migration — the backfill has no
--      way to reintroduce the leak it's fixing. Per product decision,
--      this assumes every current username is the email-derived default;
--      any user who had already manually customized their username to
--      something else is NOT distinguishable from that default in the
--      current schema (no "was this ever edited" column exists), so
--      their chosen name is also replaced. They can re-set it via the
--      existing Settings -> Manage Account -> Username flow, now with
--      the same abuse-guard validation as everyone else.
--   4. handle_new_user(): the split_part(email) fallback is removed
--      entirely — a client-supplied, valid, not-already-taken
--      raw_user_meta_data username is honored if one is ever sent in the
--      future (no current signup code path sends one); otherwise a
--      random username is generated. Every other part of the function
--      (domain parsing, university lookup, unsupported-domain rejection)
--      is unchanged.
--   5. Case-insensitive uniqueness: a unique index on lower(username) —
--      added only after the backfill guarantees no existing collisions,
--      so this cannot fail regardless of whatever idx_profiles_username
--      (a plain, non-unique-looking lookup index, confirmed to exist via
--      `supabase inspect db index-stats --linked`; its uniqueness status
--      could not be confirmed with any further read-only tool available
--      in this environment) was or wasn't enforcing before. This
--      migration establishes a real uniqueness guarantee itself, so it
--      does not depend on that prior answer either way.
--
-- NOT CHANGED: profiles table's other columns; posts_summary_view,
-- comments_with_details, chats_view, user_chats_summary, or any other
-- view (all already just SELECT profiles.username as-is — the column's
-- *contents* change, not its name or any view's shape); anonymous chat
-- identity (chat-scoped hash, never reads username); anonymous
-- post/comment redaction (nulls username entirely for non-authors,
-- independent of its value); auth.users / email handling of any kind
-- beyond the university-domain lookup that already existed.
--
-- ============================================================
-- VERIFICATION NOTE
-- ============================================================
-- Could not run this migration against a live/local Postgres instance
-- before applying — Docker is unavailable in this environment (needed
-- for `supabase db start`/`db reset`), and a direct psql connection to
-- the linked project was correctly blocked as a live-production-
-- credential action. The SQL below was reasoned through line by line
-- instead of executed against a real engine. Recommend running
-- `SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 20;`
-- immediately after this applies, to confirm the backfill produced the
-- expected AdjectiveNounNNN shape with no duplicates, before treating
-- this as fully verified.
-- ============================================================

-- ── 1. Random username generator ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_random_username()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjectives text[] := ARRAY[
    'Blue','Silent','Swift','Golden','Crimson','Silver','Cosmic','Electric',
    'Frozen','Hidden','Bright','Wild','Bold','Quiet','Rapid','Mighty',
    'Gentle','Sharp','Vivid','Lucky','Brave','Calm','Clever','Daring',
    'Eager','Fierce','Happy','Jolly','Keen','Lively','Misty','Noble',
    'Proud','Quick','Radiant','Sleek','Urban','Vast','Witty','Amber'
  ];
  v_nouns text[] := ARRAY[
    'Falcon','River','Tiger','Wolf','Eagle','Panda','Comet','Storm',
    'Phoenix','Dragon','Otter','Hawk','Lion','Bear','Fox','Owl',
    'Shark','Whale','Dolphin','Panther','Lynx','Raven','Sparrow','Cobra',
    'Meteor','Nebula','Galaxy','Canyon','Summit','Glacier','Forest','Meadow',
    'Harbor','Island','Lagoon','Volcano','Prairie','Tundra','Reef','Cloud'
  ];
  v_candidate text;
  v_attempt   int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate :=
      v_adjectives[1 + floor(random() * array_length(v_adjectives, 1))::int] ||
      v_nouns[1 + floor(random() * array_length(v_nouns, 1))::int] ||
      floor(random() * 900 + 100)::int::text;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
    );

    -- Base word-list space is 40*40*900 = 1.44M combinations. If that's
    -- ever exhausted by bad luck within 20 attempts, widen with an extra
    -- random digit (still within the 20-char format limit: longest
    -- word-pair combination here is 19 chars) rather than looping
    -- unboundedly.
    IF v_attempt >= 20 THEN
      v_candidate := v_candidate || floor(random() * 10)::int::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
      );
    END IF;

    EXIT WHEN v_attempt >= 50; -- absolute safety valve
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_random_username() FROM PUBLIC;

-- ── 2. Shared format validator ──────────────────────────────────────────
-- Deliberately left executable by default (no REVOKE): it touches no
-- table and leaks nothing — a pure format check, safe for any role,
-- including a future client-side pre-check via RPC if ever wanted.
CREATE OR REPLACE FUNCTION public.is_valid_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_username IS NOT NULL
     AND length(p_username) BETWEEN 3 AND 20
     AND p_username ~ '^[A-Za-z0-9_]+$';
$$;

-- ── 3. Backfill every existing profile with a fresh random username ────
-- Row-by-row (not a set-based UPDATE) so each generated candidate is
-- checked for uniqueness against the live table, including usernames
-- already assigned earlier in this same loop. profiles is small (105
-- rows at last check via `supabase inspect db table-stats --linked`) so
-- this is fast; revisit with a batched approach if the table grows to a
-- scale where a per-row loop becomes slow.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles ORDER BY id LOOP
    UPDATE public.profiles
    SET username = public.generate_random_username()
    WHERE id = r.id;
  END LOOP;
END $$;

-- ── 4. Enforce format + case-insensitive uniqueness at the DB level ────
-- Safe regardless of whatever idx_profiles_username was: the backfill
-- above guarantees every current value is already unique and
-- well-formed, so neither of these can fail.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_check CHECK (public.is_valid_username(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique_ci
  ON public.profiles (lower(username));

-- ── 5. Update the signup trigger: no more email-derived fallback ───────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_domain        text;
  v_university_id uuid;
  v_meta_username text;
  v_username      text;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));

  SELECT id INTO v_university_id
    FROM public.universities
   WHERE domain = v_domain;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'University not supported for domain %', v_domain
      USING ERRCODE = 'check_violation';
  END IF;

  -- Honor a client-supplied username if one is ever sent (no current
  -- signup code path sends one) and it's valid and not already taken;
  -- otherwise, and for every signup today, generate a random one. Never
  -- falls back to the email local-part.
  v_meta_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');

  IF v_meta_username IS NOT NULL
     AND public.is_valid_username(v_meta_username)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_meta_username)
     )
  THEN
    v_username := v_meta_username;
  ELSE
    v_username := public.generate_random_username();
  END IF;

  INSERT INTO public.profiles (id, username, avatar_url, university_id)
  VALUES (
    NEW.id,
    v_username,
    NEW.raw_user_meta_data->>'avatar_url',
    v_university_id
  );
  RETURN NEW;
END;
$$;
