import { useState, useRef, useEffect, useCallback } from "react";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

const NEAR_BOTTOM_THRESHOLD = 80;
const SCROLL_THROTTLE_MS = 100;

export function useChatAutoScroll(flatListRef: React.RefObject<{ scrollToOffset: (p: { offset: number; animated: boolean }) => void } | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const isAtBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef<string | null>(null);
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOffsetRef = useRef(0);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    return () => {
      if (scrollThrottleRef.current != null) {
        clearTimeout(scrollThrottleRef.current);
      }
    };
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    lastOffsetRef.current = offsetY;

    if (scrollThrottleRef.current != null) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null;
      const nearBottom = lastOffsetRef.current <= NEAR_BOTTOM_THRESHOLD;
      if (nearBottom !== isAtBottomRef.current) {
        setIsAtBottom(nearBottom);
        if (nearBottom) {
          setPendingNewCount(0);
        }
      }
    }, SCROLL_THROTTLE_MS);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, [flatListRef]);

  const clearPending = useCallback(() => {
    setPendingNewCount(0);
  }, []);

  const incrementPending = useCallback(() => {
    setPendingNewCount((c) => c + 1);
  }, []);

  return {
    onScroll,
    scrollToBottom,
    isAtBottom,
    isAtBottomRef,
    pendingNewCount,
    setPendingNewCount,
    clearPending,
    incrementPending,
    hasScrolledInitiallyRef,
  };
}
