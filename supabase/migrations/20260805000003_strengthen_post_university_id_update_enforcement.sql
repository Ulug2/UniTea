-- ============================================================
-- Phase 1 (follow-up) — Close university_id spoofing on UPDATE
-- ============================================================
-- 20260805000002 closed university_id spoofing on INSERT (trigger
-- always derives it from the author's profile + an independent RLS
-- check), but posts.user_id -> profiles.university_id -> posts.
-- university_id was never enforced on UPDATE. The trigger only ran
-- BEFORE INSERT, and "Update own posts" has no column-level check at
-- all — a post owner could run
--   UPDATE posts SET university_id = '<other-university>' WHERE id = ...
-- against a post they own and it would pass RLS untouched.
--
-- Audited before this change: grep across src/ and supabase/functions/
-- confirms nothing in the app performs a direct UPDATE on posts today
-- — delete-post uses a real .delete() via the service role, and there
-- is no edit-post feature (is_edited/edited_at are display-only
-- fields, never written by any client/Edge Function). This closes a
-- currently-dormant but open attack surface with no legitimate
-- caller to regress.
--
-- Same two-layer approach as the INSERT fix, adapted for UPDATE:
--
-- 1. TRIGGER: set_post_university_id() now also fires BEFORE UPDATE,
--    unconditionally re-deriving NEW.university_id from
--    profiles.university_id WHERE id = NEW.user_id — same function,
--    same logic, no new code path. For every real edit (user_id
--    unchanged) this is a no-op re-assertion of the value it already
--    had. Runs regardless of caller (self or admin), which is what
--    makes it correct for admin edits of another university's post
--    too — see point 2.
--
-- 2. RLS backstop: unlike the INSERT policy, this CANNOT check
--    university_id = get_my_university_id() — "Update own posts"
--    already allows admins to edit ANY post via get_my_is_admin(),
--    and admins are meant to bypass university isolation globally
--    (see 20260609120001_university_rls.sql's header comment). An
--    admin at NU editing an SDU post must still be allowed, so the
--    check instead ties university_id to the POST'S OWN author
--    (its user_id), independent of who is calling:
--      university_id = (SELECT university_id FROM profiles
--                        WHERE id = user_id)
--    This holds for both self-edits and admin-edits, and — like the
--    INSERT backstop — can never actually fail for a legitimate edit
--    once the trigger has already corrected the row; it exists so the
--    invariant holds even if the trigger were ever altered or
--    dropped.
--
-- Unaffected by design: ownership/admin check (auth.uid() = user_id
-- OR get_my_is_admin(), unchanged), community membership rules
-- (untouched, not part of this policy), is_anonymous, moderation,
-- INSERT/SELECT/DELETE policies, existing row data.
-- ============================================================

BEGIN;

-- 1. Trigger: also fire on UPDATE, same derivation logic as INSERT.
DROP TRIGGER IF EXISTS trg_set_post_university_id ON public.posts;
CREATE TRIGGER trg_set_post_university_id
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_post_university_id();

-- 2. RLS: independent backstop tied to the post's own author, not the caller.
DROP POLICY IF EXISTS "Update own posts" ON public.posts;

CREATE POLICY "Update own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id OR public.get_my_is_admin())
  WITH CHECK (
    (auth.uid() = user_id OR public.get_my_is_admin())
    AND university_id = (
      SELECT p.university_id FROM public.profiles p WHERE p.id = user_id
    )
  );

COMMIT;
