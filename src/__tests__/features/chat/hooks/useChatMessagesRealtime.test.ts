/**
 * Tests for src/features/chat/hooks/useChatMessagesRealtime.ts
 */

jest.mock('../../../../features/chat/data/realtime', () => ({
  subscribeToChatMessages: jest.fn(),
}));
jest.mock('../../../../features/chat/data/cache', () => ({
  prependIncomingMessage: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useChatMessagesRealtime } from '../../../../features/chat/hooks/useChatMessagesRealtime';
import { subscribeToChatMessages } from '../../../../features/chat/data/realtime';
import { prependIncomingMessage } from '../../../../features/chat/data/cache';

const mockSubscribe = subscribeToChatMessages as jest.Mock;
const mockPrepend = prependIncomingMessage as jest.Mock;

let queryClient: QueryClient;
let mockCleanup: jest.Mock;
let mockAppStateRemove: jest.Mock;
let addEventListenerSpy: jest.SpyInstance;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.clearAllMocks();
  mockCleanup = jest.fn();
  mockAppStateRemove = jest.fn();
  mockSubscribe.mockReturnValue(mockCleanup);
  addEventListenerSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: mockAppStateRemove } as any);
  jest.useFakeTimers();
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function makeOpts(): { pendingMessageIdsRef: React.MutableRefObject<Set<string>> } {
  const ref = { current: new Set<string>() };
  return { pendingMessageIdsRef: ref };
}

describe('useChatMessagesRealtime', () => {
  it('does NOT subscribe when chatId is empty', () => {
    renderHook(() => useChatMessagesRealtime('', 'u1', makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when currentUserId is undefined', () => {
    renderHook(() => useChatMessagesRealtime('chat-1', undefined, makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('calls subscribeToChatMessages with chatId on mount', () => {
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).toHaveBeenCalledWith('chat-1', expect.any(Function));
  });

  it('calls cleanup function on unmount', () => {
    const { unmount } = renderHook(
      () => useChatMessagesRealtime('chat-1', 'u1', makeOpts()),
      { wrapper: createWrapper() }
    );
    unmount();
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('removes AppState listener on unmount', () => {
    const { unmount } = renderHook(
      () => useChatMessagesRealtime('chat-1', 'u1', makeOpts()),
      { wrapper: createWrapper() }
    );
    unmount();
    expect(mockAppStateRemove).toHaveBeenCalled();
  });

  it('calls prependIncomingMessage for a new message from another user', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', opts), {
      wrapper: createWrapper(),
    });

    const cb = mockSubscribe.mock.calls[0][1] as (msg: any) => void;
    const msg = { id: 'new-m', user_id: 'u2', chat_id: 'chat-1' };
    act(() => { cb(msg); });

    expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', msg);
  });

  it('does NOT prepend own messages (same user_id)', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', opts), {
      wrapper: createWrapper(),
    });

    const cb = mockSubscribe.mock.calls[0][1] as (msg: any) => void;
    const msg = { id: 'own-m', user_id: 'u1', chat_id: 'chat-1' };
    act(() => { cb(msg); });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('does NOT prepend message from a different chat_id', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', opts), {
      wrapper: createWrapper(),
    });

    const cb = mockSubscribe.mock.calls[0][1] as (msg: any) => void;
    const msg = { id: 'other-m', user_id: 'u2', chat_id: 'other-chat' };
    act(() => { cb(msg); });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('does NOT prepend a message whose ID is already in pendingMessageIdsRef', () => {
    const opts = makeOpts();
    opts.pendingMessageIdsRef.current.add('dup-id');
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', opts), {
      wrapper: createWrapper(),
    });

    const cb = mockSubscribe.mock.calls[0][1] as (msg: any) => void;
    const msg = { id: 'dup-id', user_id: 'u2', chat_id: 'chat-1' };
    act(() => { cb(msg); });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('invalidates chat-messages queries when AppState becomes active', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', makeOpts()), {
      wrapper: createWrapper(),
    });

    const appStateCb = addEventListenerSpy.mock.calls[0][1] as (state: string) => void;
    act(() => { appStateCb('active'); });
    act(() => { jest.runAllTimers(); });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['chat-messages', 'chat-1'] })
    );
  });
});
