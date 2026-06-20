-- Admin-only RPC that clears all matchmaking data and resets phase to inactive.
-- SECURITY DEFINER runs as the function owner (bypasses RLS) so it can delete
-- rows from tables that have no admin DELETE policy.
CREATE OR REPLACE FUNCTION reset_matchmaking_event()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ 
BEGIN
  IF NOT get_my_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Single-statement TRUNCATE: Postgres resolves FK constraints atomically
  -- when all related tables are listed together, avoiding the
  -- "referenced in a foreign key constraint" error from sequential TRUNCATEs.
  TRUNCATE launch_event_message_windows, launch_event_matches, launch_event_profiles;
  UPDATE launch_event_config SET phase = 'inactive' WHERE id = 1;

  RETURN jsonb_build_object('ok', true);
END;
$$;
