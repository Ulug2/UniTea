-- Rate limiting v2: message RPC + DB-level trigger guards on direct inserts.
-- Triggers fire server-side, so they enforce limits regardless of how the API
-- is called (app, curl, Postman, etc.).  They call the existing check_rate_limit()
-- function from the v1 migration and skip the check when auth.uid() is NULL
-- (i.e. service-role edge function calls).

-- ── 1. check_message_rate_limit ──────────────────────────────────────────────
-- Wrapper with the exact signature expected by useChatSendMessage.ts so that
-- the server-side message rate check actually works (the RPC was coded but the
-- function was never deployed).
-- DROP first: CREATE OR REPLACE cannot change existing parameter defaults.
DROP FUNCTION IF EXISTS check_message_rate_limit(uuid, uuid, integer, integer);
CREATE FUNCTION check_message_rate_limit(
  p_user_id            UUID,
  p_chat_id            UUID,
  p_max_messages       INT,
  p_time_window_minutes INT
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_rate_limit(
    'msg:' || p_user_id::text,
    p_max_messages,
    p_time_window_minutes * 60
  )
$$;

-- ── 2. Community creation — 3 per hour ──────────────────────────────────────
CREATE OR REPLACE FUNCTION rate_limit_community_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT check_rate_limit('community:create:' || auth.uid()::text, 3, 3600) THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_community_create ON communities;
CREATE TRIGGER trg_rate_limit_community_create
  BEFORE INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION rate_limit_community_create();

-- ── 3. Chat initiation — 30 new chats per hour ──────────────────────────────
CREATE OR REPLACE FUNCTION rate_limit_chat_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT check_rate_limit('chat:init:' || auth.uid()::text, 30, 3600) THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_chat_create ON chats;
CREATE TRIGGER trg_rate_limit_chat_create
  BEFORE INSERT ON chats
  FOR EACH ROW EXECUTE FUNCTION rate_limit_chat_create();

-- ── 4. Reports — 10 per hour ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rate_limit_reports()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NOT check_rate_limit('report:' || auth.uid()::text, 10, 3600) THEN
    RAISE EXCEPTION 'rate_limit_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_limit_reports ON reports;
CREATE TRIGGER trg_rate_limit_reports
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION rate_limit_reports();
