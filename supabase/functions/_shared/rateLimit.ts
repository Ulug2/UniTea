// Supabase Edge Function - Runs on Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT_TIMEOUT_MS = 2000;

/**
 * Check a sliding-window rate limit via the check_rate_limit() Postgres function.
 *
 * @param key            Unique string identifying the actor + action (e.g. "post:user-uuid")
 * @param maxRequests    Maximum number of hits allowed in the window
 * @param windowSeconds  Length of the sliding window in seconds
 * @returns true if the request is allowed, false if the limit is exceeded
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Race the DB call against a hard deadline so a slow or hung rate-limit
    // table never blocks the calling function indefinitely.
    const dbCall = adminClient.rpc("check_rate_limit", {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    const timeout = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: new Error("rate limit check timed out") }),
        RATE_LIMIT_TIMEOUT_MS,
      )
    );

    const { data, error } = await Promise.race([dbCall, timeout]);

    if (error) {
      // Fail open: allow the request but log so infra issues are visible.
      console.error("Rate limit check error:", error.message ?? error);
      return true;
    }

    return Boolean(data);
  } catch (err) {
    console.error("Rate limit check exception:", err);
    return true;
  }
}

/** Extract the best-effort client IP from request headers. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

/** Build a 429 Too Many Requests response. */
export function rateLimitExceededResponse(
  corsHeaders: Record<string, string>,
  retryAfterSeconds = 60,
): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
