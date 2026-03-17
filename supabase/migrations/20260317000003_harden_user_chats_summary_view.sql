-- ============================================================
-- Migration: Harden user_chats_summary view security
--
-- Fixes Supabase Security Advisor warning about SECURITY DEFINER by
-- forcing SECURITY INVOKER behavior (caller privileges/RLS context).
-- ============================================================

ALTER VIEW IF EXISTS public.user_chats_summary
  SET (security_invoker = true);

REVOKE ALL ON public.user_chats_summary FROM PUBLIC;
GRANT SELECT ON public.user_chats_summary TO authenticated;

