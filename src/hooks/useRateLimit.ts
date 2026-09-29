import { useCallback, useEffect, useState } from "react";

export function useRateLimit(options: { cooldownMs: number }) {
  const { cooldownMs } = options;
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);

  // Clear the limit once it expires so consumers re-render unlocked. Without
  // this the limit would only be re-evaluated on unrelated state changes.
  useEffect(() => {
    if (rateLimitUntil == null) return;
    const timer = setTimeout(
      () => setRateLimitUntil(null),
      Math.max(0, rateLimitUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [rateLimitUntil]);

  // Derived from the clock on every render (not memoized) so a render after
  // expiry — e.g. timers delayed while the app was backgrounded — is unlocked.
  const remainingMs =
    rateLimitUntil == null ? 0 : Math.max(0, rateLimitUntil - Date.now());
  const isLimited = remainingMs > 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  const trigger = useCallback(
    (durationMs?: number) => {
      setRateLimitUntil(Date.now() + (durationMs ?? cooldownMs));
    },
    [cooldownMs]
  );

  const clear = useCallback(() => {
    setRateLimitUntil(null);
  }, []);

  return {
    isLimited,
    remainingMs,
    remainingSeconds,
    trigger,
    clear,
  };
}
