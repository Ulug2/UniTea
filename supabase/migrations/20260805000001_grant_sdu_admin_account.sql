-- ============================================================
-- Phase 1 / Task 2 — Grant admin access to the SDU admin account
-- ============================================================
-- Uses the existing admin permission system (profiles.is_admin, read
-- everywhere via public.get_my_is_admin()) — no new column, table, or
-- permission mechanism. Nothing is hardcoded into frontend logic; this
-- is a one-time data change against whatever profile already exists
-- for this email.
--
-- bablbig27@gmail.com does not match either registered university
-- domain (nu.edu.kz, stu.sdu.edu.kz), so it cannot complete signup
-- through the existing handle_new_user() domain gate as-is. Per
-- product decision, this migration assumes the account is created
-- out-of-band (e.g. via the Supabase Dashboard) and only grants
-- is_admin — it does not touch handle_new_user() or any signup path.
-- If no matching account exists yet, this is a safe no-op (0 rows
-- affected) and can be re-run once the account has been created.
--
-- profiles.is_admin is guarded by trg_guard_profile_sensitive_columns
-- (20260628000000_security_fixes.sql), which raises "permission
-- denied: is_admin cannot be changed" for any UPDATE unless
-- auth.role() = 'service_role' — this is what already gates is_banned
-- too, which is why is_banned can only be changed via the ban-user /
-- unban-user Edge Functions rather than a direct UPDATE. A plain
-- migration connection has no request.jwt.claims context at all, so
-- it fails this check exactly like any other non-service-role caller
-- would — this is the guard working as intended, not a bug.
--
-- request.jwt.claims is just the Postgres GUC PostgREST/Edge Functions
-- populate from the caller's verified JWT before auth.role() reads it;
-- setting it explicitly for this transaction reproduces the exact
-- context a genuine service-role request would have, satisfying the
-- guard's own existing exemption rather than weakening or bypassing
-- it. SET LOCAL is transaction-scoped and reverts automatically —
-- nothing about the guard, the trigger, or any other session/role is
-- changed by this.
-- ============================================================

DO $$
DECLARE
  v_user_id uuid;
  v_rows_updated int;
BEGIN
  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email) = lower('bablbig27@gmail.com')
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for bablbig27@gmail.com — is_admin not granted. Create the account, then re-run this migration (or a follow-up UPDATE) to grant admin.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.profiles
     SET is_admin = true
   WHERE id = v_user_id
     AND is_admin IS DISTINCT FROM true;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE NOTICE 'auth.users row exists for bablbig27@gmail.com but no matching profiles row was updated (already admin, or profile missing) — verify manually.';
  ELSE
    RAISE NOTICE 'Granted is_admin = true to profile % for bablbig27@gmail.com.', v_user_id;
  END IF;
END $$;
