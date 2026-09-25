import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives a RefreshControl's `refreshing` flag ONLY from user-initiated pulls.
 *
 * Binding it to a query's `isRefetching` also shows the spinner for
 * background refetches (e.g. an invalidation after posting a comment) the
 * user never pulled. On iOS, a programmatic refresh on a hidden tab shifts
 * the list down to make room for the spinner and doesn't shift it back, so
 * the list stays "dragged down" until the user drags it.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      if (isMountedRef.current) setRefreshing(false);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}
