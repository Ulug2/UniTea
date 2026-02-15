-- RLS policies for the moderation webpage: admins can read all profiles and reports.
-- Run this in Supabase SQL Editor. Safe to run multiple times (idempotent).
-- Requires: profiles and reports tables exist; profiles has is_admin column.

-- Helper: returns true if the current user's profile has is_admin = true.
-- SECURITY DEFINER so it reads profiles without triggering RLS (avoids infinite recursion).
CREATE OR REPLACE FUNCTION public.get_my_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- --- PROFILES ---

-- Drop and recreate admin read policy so it uses the function (no recursion)
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.get_my_is_admin());

-- Authenticated users can read all profiles (main app + moderation dashboard loading own profile)
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
CREATE POLICY "Authenticated can read profiles"
  ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can read own profile (redundant with above but explicit; no subquery)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
      ON public.profiles
      FOR SELECT
      USING (id = auth.uid());
  END IF;
END $$;

-- Users can update own profile (main app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles
      FOR UPDATE
      USING (id = auth.uid());
  END IF;
END $$;

-- --- REPORTS ---

-- Admins can read all reports (uses function, no recursion)
DROP POLICY IF EXISTS "Admins can read all reports" ON public.reports;
CREATE POLICY "Admins can read all reports"
  ON public.reports
  FOR SELECT
  USING (public.get_my_is_admin());

-- Admins can update reports
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can update reports"
  ON public.reports
  FOR UPDATE
  USING (public.get_my_is_admin());

-- Users can insert own reports (main app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'Users can insert own reports'
  ) THEN
    CREATE POLICY "Users can insert own reports"
      ON public.reports
      FOR INSERT
      WITH CHECK (reporter_id = auth.uid());
  END IF;
END $$;
