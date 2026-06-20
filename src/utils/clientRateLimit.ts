import { supabase } from '../lib/supabase';

/**
 * Client-side rate limit check using the server-side check_rate_limit() RPC.
 * Throws an error with message 'rate_limit_exceeded' when the limit is hit.
 * Fails open on RPC errors (network issues, function not deployed) so normal
 * usage is never blocked by infrastructure problems.
 */
export async function checkClientRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<void> {
  try {
    const { data, error } = await (supabase as any).rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (!error && data === false) {
      throw new Error('rate_limit_exceeded');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'rate_limit_exceeded') throw err;
    // Any other error (network, RPC not deployed) → fail open
  }
}

/** Returns true if an error from any source is a rate limit error. */
export function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return msg.includes('rate_limit_exceeded');
}
