import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MIN_ITEMS = 3;
const DEFAULT_TIMEOUT_MS = 2500;

type Options = {
  minItems?: number;
  timeoutMs?: number;
  /** When false, timeout is not started (e.g. for chat detail until data is ready). Default true. */
  enabled?: boolean;
};

/**
 * Hook for list/screen "reveal after first N images loaded" pattern.
 * List items call onItemReady() when their images have loaded (or they have no images).
 * When minItems have reported ready, or timeoutMs has passed, shouldReveal becomes true.
 * Only pass onItemReady to the first few items (e.g. first 5) for efficiency.
 */
export function useRevealAfterFirstNImages(options: Options = {}) {
  const minItems = options.minItems ?? DEFAULT_MIN_ITEMS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const enabled = options.enabled ?? true;

  const [shouldReveal, setShouldReveal] = useState(false);
  const countRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onItemReady = useCallback(() => {
    if (countRef.current >= minItems) return;
    countRef.current += 1;
    if (countRef.current >= minItems) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShouldReveal(true);
    }
  }, [minItems]);

  useEffect(() => {
    if (!enabled || shouldReveal) return;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setShouldReveal(true);
    }, timeoutMs);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, shouldReveal, timeoutMs]);

  return { shouldReveal, onItemReady };
}
