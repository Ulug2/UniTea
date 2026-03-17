-- ============================================================
-- Migration: Harden posts_summary_view security
--
-- Fixes Supabase Security Advisor warning about SECURITY DEFINER.
-- Ensures the view runs with the caller's privileges/RLS context.
--
-- Note: This does not change the view definition, only its security option.
-- ============================================================

ALTER VIEW IF EXISTS public.posts_summary_view
  SET (security_invoker = true);

REVOKE ALL ON public.posts_summary_view FROM PUBLIC;
GRANT SELECT ON public.posts_summary_view TO authenticated;

