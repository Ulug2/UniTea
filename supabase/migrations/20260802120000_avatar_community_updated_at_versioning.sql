BEGIN;

-- ============================================================
-- Phase 6, Part 1: image cache versioning support
-- ============================================================
--
-- Deterministic storage paths (avatars/{userId}/avatar.{ext},
-- post-images/{communityId}/avatar.{ext}) mean the public image URL for
-- a given user/community never changes across replacements. Both the
-- CDN (Cache-Control: 3600 set at upload time) and expo-image's own
-- disk cache key on that exact URL string, so without some changing
-- value appended to the URL, a client that already has the old image
-- cached would keep showing it after a legitimate replacement.
--
-- Investigated before deciding to touch schema at all (per instruction
-- not to add a column immediately):
--   * profiles.updated_at already exists, but no trigger bumps it on
--     UPDATE (confirmed: profiles' only triggers are
--     trg_assign_founding_member and trg_guard_profile_sensitive_columns
--     — neither touches updated_at). useUpdateProfile.ts's plain
--     `.update(updates)` call never sets it either. So today it's
--     effectively frozen at row-creation time and unusable as a
--     version signal as-is.
--   * communities has no updated_at (or any other field that changes
--     specifically when avatar_url is replaced) at all — created_at is
--     write-once. No existing field can serve as a version source.
--
-- Fix: a trigger, reusing the existing generic
-- public.update_updated_at_column() function (already used elsewhere
-- in this schema, e.g. on storage.objects) rather than writing a new
-- one. For profiles, this only requires a trigger (the column already
-- exists). For communities, since no existing field works, this adds
-- the same standard updated_at column every other major table in this
-- schema already has, plus the same trigger.
-- ============================================================

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.communities
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
