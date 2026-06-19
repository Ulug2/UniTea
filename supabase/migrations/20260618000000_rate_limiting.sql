-- Sliding-window rate limiting table.
-- Only accessible via the check_rate_limit() SECURITY DEFINER function;
-- direct PostgREST access is blocked by RLS with no policies.
CREATE TABLE IF NOT EXISTS rate_limits (
  id        BIGSERIAL    PRIMARY KEY,
  key       TEXT         NOT NULL,
  hit_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_hit_at ON rate_limits (key, hit_at);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- check_rate_limit: record a hit and return TRUE if allowed, FALSE if limit exceeded.
-- Uses SECURITY DEFINER so Edge Functions calling via the anon/service-role client
-- can write to rate_limits without a public RLS policy.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            TEXT,
  p_max_requests   INT,
  p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Prune stale hits for this key to keep the table small
  DELETE FROM rate_limits WHERE key = p_key AND hit_at < v_window_start;

  -- Count hits within the current window
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE key = p_key AND hit_at >= v_window_start;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limits (key, hit_at) VALUES (p_key, NOW());
  RETURN TRUE;
END;
$$;
