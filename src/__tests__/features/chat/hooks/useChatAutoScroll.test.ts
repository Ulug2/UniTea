/**
 * Tests for src/features/chat/hooks/useChatAutoScroll.ts
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useChatAutoScroll } from '../../../../features/chat/hooks/useChatAutoScroll';

function makeFlatListRef(scrollToOffset = jest.fn()) {
  return React.createRef<{ scrollToOffset: typeof scrollToOffset }>();
}

function makeScrollEvent(y: number) {
  return {
    nativeEvent: { contentOffset: { y } },
  } as any;
}

describe('useChatAutoScroll', () => {
  it('isAtBottom starts true and pendingNewCount starts 0', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.pendingNewCount).toBe(0);
  });

  it('onScroll with y <= 80 keeps isAtBottom true', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    act(() => {
      result.current.onScroll(makeScrollEvent(80));
    });
    expect(result.current.isAtBottom).toBe(true);
  });

  it('onScroll with y > 80 sets isAtBottom to false', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    act(() => {
      result.current.onScroll(makeScrollEvent(81));
    });
    expect(result.current.isAtBottom).toBe(false);
  });

  it('onScroll near bottom clears pendingNewCount', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    // Scroll away and add pending
    act(() => {
      result.current.onScroll(makeScrollEvent(200));
    });
    act(() => {
      result.current.incrementPending();
    });
    expect(result.current.pendingNewCount).toBe(1);
    // Scroll back to bottom
    act(() => {
      result.current.onScroll(makeScrollEvent(0));
    });
    expect(result.current.pendingNewCount).toBe(0);
  });

  it('incrementPending increases pendingNewCount', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    act(() => { result.current.incrementPending(); });
    act(() => { result.current.incrementPending(); });
    expect(result.current.pendingNewCount).toBe(2);
  });

  it('clearPending resets pendingNewCount to 0', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    act(() => { result.current.incrementPending(); });
    act(() => { result.current.clearPending(); });
    expect(result.current.pendingNewCount).toBe(0);
  });

  it('scrollToBottom calls flatListRef.current.scrollToOffset with offset 0', () => {
    const scrollToOffset = jest.fn();
    const ref = { current: { scrollToOffset } } as any;
    const { result } = renderHook(() => useChatAutoScroll(ref));
    act(() => {
      result.current.scrollToBottom();
    });
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('isAtBottomRef stays in sync with isAtBottom state', () => {
    const ref = makeFlatListRef();
    const { result } = renderHook(() => useChatAutoScroll(ref as any));
    expect(result.current.isAtBottomRef.current).toBe(true);
    act(() => {
      result.current.onScroll(makeScrollEvent(200));
    });
    expect(result.current.isAtBottomRef.current).toBe(false);
  });
});
