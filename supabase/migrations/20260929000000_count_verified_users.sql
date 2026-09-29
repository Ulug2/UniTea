BEGIN;

-- ============================================================
-- Verified-user count for the public landing page
-- ============================================================
--
-- profile-count (unitea.app) should only count students who verified their
-- email. Profiles are created by on_auth_user_created at signup, before
-- verification, so counting profiles includes unverified signups.
-- auth.users is not reachable through PostgREST, hence this RPC.
-- Returns only an aggregate; callable by service_role only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_verified_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email_confirmed_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.count_verified_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_verified_users() TO service_role;

COMMIT;
