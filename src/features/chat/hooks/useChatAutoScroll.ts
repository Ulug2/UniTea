import { useState, useRef, useEffect, useCallback } from "react";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

const NEAR_BOTTOM_THRESHOLD = 80;

export function useChatAutoScroll(flatListRef: React.RefObject<{ scrollToOffset: (p: { offset: number; animated: boolean }) => void } | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const isAtBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef<string | null>(null);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nearBottom = e.nativeEvent.contentOffset.y <= NEAR_BOTTOM_THRESHOLD;
    if (nearBottom !== isAtBottomRef.current) {
      setIsAtBottom(nearBottom);
      if (nearBottom) {
        setPendingNewCount(0);
      }
    }
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
