-- ============================================================
-- Fix the notifications-insert trigger.
--
-- The original trigger was created via the Supabase dashboard
-- and hardcoded the service_role key directly in the
-- supabase_functions.http_request call. That key has been
-- rotated. This migration:
--
--  1. Drops the old dashboard-created trigger.
--  2. Creates a new trigger function that reads a webhook
--     secret from Supabase Vault instead of embedding any
--     sensitive key in the SQL.
--  3. Recreates the trigger with the corrected Edge Function
--     URL (the original had a "functis" typo).
--
-- Before applying this migration, store the webhook secret
-- in Vault and set the matching Supabase secret:
--
--   -- In the Supabase SQL editor:
--   SELECT vault.create_secret(
--     'your-random-webhook-secret',
--     'notification_webhook_secret'
--   );
--
--   -- Via Supabase CLI:
--   supabase secrets set NOTIFICATION_WEBHOOK_SECRET=your-random-webhook-secret
-- ============================================================

-- Drop the old trigger created via the dashboard
DROP TRIGGER IF EXISTS "notifications-insert" ON public.notifications;

-- Drop any leftover wrapper function (dashboard may have created one)
DROP FUNCTION IF EXISTS public.notify_push_on_insert() CASCADE;


-- ── New trigger function ─────────────────────────────────────────────────────
-- Reads the webhook secret from Vault at call time so no sensitive value is
-- stored in the function body or pg_proc catalog.

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text;
BEGIN
  -- Retrieve the shared webhook secret from Supabase Vault.
  -- The secret must be created with name = 'notification_webhook_secret'
  -- before this trigger is active (see migration header for instructions).
  SELECT decrypted_secret
    INTO webhook_secret
    FROM vault.decrypted_secrets
   WHERE name = 'notification_webhook_secret'
   LIMIT 1;

  IF webhook_secret IS NULL THEN
    RAISE WARNING 'trigger_send_push_notification: notification_webhook_secret not found in Vault — skipping push';
    RETURN NEW;
  END IF;

  -- supabase_functions.http_request() is a trigger function (reads TG_ARGV),
  -- not callable directly. Use net.http_post instead.
  PERFORM net.http_post(
    url                  := 'https://rtynfdpezsrolwsglgoe.supabase.co/functions/v1/send-push-notification',
    body                 := '{}'::jsonb,
    params               := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type',     'application/json',
                              'x-webhook-secret', webhook_secret
                            ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- Only the trigger mechanism needs to execute this function; revoke public access.
REVOKE EXECUTE ON FUNCTION public.trigger_send_push_notification() FROM PUBLIC;


-- ── Recreate the trigger ─────────────────────────────────────────────────────
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();
