import { useCallback, useEffect, useRef } from "react";

type TimeoutId = ReturnType<typeof setTimeout>;

export function useTimeoutRace() {
  const timersRef = useRef<Set<TimeoutId>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const race = useCallback(async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = "Request timeout"
  ): Promise<T> => {
    let timer: TimeoutId | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        timersRef.current.add(timer);
      });

      return (await Promise.race([promise, timeoutPromise])) as T;
    } finally {
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(timer);
      }
    }
  }, []);

  return { race };
}

