import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchMatchWindow } from '../data/queries';
import type { MatchWindowStatus } from '../types';

function computeStatus(
  raw: { viewed_at: string; window_expires_at: string } | null | undefined,
): MatchWindowStatus {
  if (!raw) {
    return { viewed_at: null, window_expires_at: null, isExpired: false, msRemaining: 0 };
  }
  const expiresMs = new Date(raw.window_expires_at).getTime();
  const now = Date.now();
  const msRemaining = Math.max(0, expiresMs - now);
  return {
    viewed_at: raw.viewed_at,
    window_expires_at: raw.window_expires_at,
    isExpired: msRemaining === 0,
    msRemaining,
  };
}

export function useMatchWindowStatus(userId?: string): MatchWindowStatus {
  const { data } = useQuery({
    queryKey: ['matchmaking', 'window', userId],
    queryFn: () => fetchMatchWindow(userId!),
    enabled: !!userId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 2,
  });

  const [status, setStatus] = useState<MatchWindowStatus>(() => computeStatus(data));

  // Sync whenever query data changes
  useEffect(() => {
    setStatus(computeStatus(data));
  }, [data]);

  // Tick every second while the window is open
  useEffect(() => {
    if (!data?.window_expires_at) return;
    const expiresMs = new Date(data.window_expires_at).getTime();
    if (Date.now() >= expiresMs) return;

    const interval = setInterval(() => {
      const msRemaining = Math.max(0, expiresMs - Date.now());
      setStatus({
        viewed_at: data.viewed_at,
        window_expires_at: data.window_expires_at,
        isExpired: msRemaining === 0,
        msRemaining,
      });
      if (msRemaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [data]);

  return status;
}
