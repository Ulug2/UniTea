import { useCallback, useMemo, useState } from "react";

export function useRateLimit(options: { cooldownMs: number }) {
  const { cooldownMs } = options;
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);

  const isLimited = useMemo(
    () => rateLimitUntil != null && Date.now() < rateLimitUntil,
    [rateLimitUntil]
  );

  const remainingMs = useMemo(() => {
    if (!isLimited || rateLimitUntil == null) return 0;
    return Math.max(0, rateLimitUntil - Date.now());
  }, [isLimited, rateLimitUntil]);

  const remainingMinutes = useMemo(
    () => Math.ceil(remainingMs / 60000),
    [remainingMs]
  );

  const trigger = useCallback(() => {
    setRateLimitUntil(Date.now() + cooldownMs);
  }, [cooldownMs]);

  const clear = useCallback(() => {
    setRateLimitUntil(null);
  }, []);

  return {
    isLimited,
    remainingMs,
    remainingMinutes,
    trigger,
    clear,
  };
}

