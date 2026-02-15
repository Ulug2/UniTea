-- Add ban duration columns to profiles for admin moderation
-- Run this in Supabase SQL Editor, then refresh your local types if using codegen.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_permanently_banned boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.banned_until IS 'When a temporary ban ends; null if not banned or permanent';
COMMENT ON COLUMN public.profiles.is_permanently_banned IS 'True if user is permanently banned';
