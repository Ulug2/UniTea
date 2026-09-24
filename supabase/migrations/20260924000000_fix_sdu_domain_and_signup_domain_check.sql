BEGIN;

-- ============================================================
-- Fix SDU signup domain + make the pre-signup domain check work
-- ============================================================
--
-- 1. SDU was seeded (20260609120000_universities_multitenancy.sql) with
--    domain 'stu.sdu.edu.kz', but SDU accounts use '@sdu.edu.kz'. Every
--    '@sdu.edu.kz' signup was rejected by handle_new_user() ("University
--    not supported for domain sdu.edu.kz"). Existing profiles reference
--    universities by id, so renaming the domain in place keeps every
--    existing SDU user, post and admin scope attached to the same row.
--
-- 2. The client's pre-signup domain check read public.universities as
--    the anon role, which has had no SELECT on that table since
--    20260621120000_revoke_anon_content_access.sql. The read silently
--    returned nothing and the client fell open, so unsupported domains
--    reached auth.signUp and surfaced as a generic 500. This function
--    answers only "is this domain supported?" without re-exposing the
--    table to anon.
-- ============================================================

UPDATE public.universities
   SET domain = 'sdu.edu.kz'
 WHERE domain = 'stu.sdu.edu.kz';

CREATE OR REPLACE FUNCTION public.is_supported_university_domain(p_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.universities
     WHERE domain = lower(trim(p_domain))
  );
$$;

REVOKE ALL ON FUNCTION public.is_supported_university_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_supported_university_domain(text) TO anon, authenticated;

COMMIT;
