/**
 * Tests for src/features/chat/hooks/useChatMessagesRealtime.ts
 */

const mockFromChain = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
};
Object.defineProperty(mockFromChain, 'then', {
  get() {
    const p = Promise.resolve({ error: null });
    return p.then.bind(p);
  },
  configurable: true,
});
jest.mock('../../../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFromChain), rpc: jest.fn() },
}));
jest.mock('../../../../features/chat/data/realtime', () => ({
  subscribeToChatMessages: jest.fn(),
}));
jest.mock('../../../../features/chat/data/cache', () => ({
  prependIncomingMessage: jest.fn(),
  upsertIncomingMessage: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useChatMessagesRealtime } from '../../../../features/chat/hooks/useChatMessagesRealtime';
import { subscribeToChatMessages } from '../../../../features/chat/data/realtime';
import { prependIncomingMessage } from '../../../../features/chat/data/cache';
import { supabase } from '../../../../lib/supabase';

const mockSubscribe = subscribeToChatMessages as jest.Mock;
const mockPrepend = prependIncomingMessage as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

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
  mockRpc.mockResolvedValue({ error: null });
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
    renderHook(() => useChatMessagesRealtime('', 'u1', false, makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when currentUserId is undefined', () => {
    renderHook(() => useChatMessagesRealtime('chat-1', undefined, false, makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('calls subscribeToChatMessages with chatId on mount', () => {
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, makeOpts()), {
      wrapper: createWrapper(),
    });
    expect(mockSubscribe).toHaveBeenCalledWith(
      'chat-1',
      'u1',
      false,
      expect.objectContaining({
        onRawInsert: expect.any(Function),
      }),
    );
  });

  it('calls cleanup function on unmount', () => {
    const { unmount } = renderHook(
      () => useChatMessagesRealtime('chat-1', 'u1', false, makeOpts()),
      { wrapper: createWrapper() }
    );
    unmount();
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('removes AppState listener on unmount', () => {
    const { unmount } = renderHook(
      () => useChatMessagesRealtime('chat-1', 'u1', false, makeOpts()),
      { wrapper: createWrapper() }
    );
    unmount();
    expect(mockAppStateRemove).toHaveBeenCalled();
  });

  it('calls prependIncomingMessage for a new message from another user', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
      .onRawInsert as (msg: any) => void;
    const msg = { id: 'new-m', user_id: 'u2', chat_id: 'chat-1' };
    act(() => {
      onRawInsert(msg);
    });

    expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', msg);
  });

  it('does NOT prepend own messages (same user_id)', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
      .onRawInsert as (msg: any) => void;
    const msg = { id: 'own-m', user_id: 'u1', chat_id: 'chat-1' };
    act(() => {
      onRawInsert(msg);
    });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('does NOT prepend message from a different chat_id', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
      .onRawInsert as (msg: any) => void;
    const msg = { id: 'other-m', user_id: 'u2', chat_id: 'other-chat' };
    act(() => {
      onRawInsert(msg);
    });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('does NOT prepend a message whose ID is already in pendingMessageIdsRef', () => {
    const opts = makeOpts();
    opts.pendingMessageIdsRef.current.add('dup-id');
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
      .onRawInsert as (msg: any) => void;
    const msg = { id: 'dup-id', user_id: 'u2', chat_id: 'chat-1' };
    act(() => {
      onRawInsert(msg);
    });

    expect(mockPrepend).not.toHaveBeenCalled();
  });

  it('does NOT prepend or invalidate unread for blocked sender', () => {
    const opts = makeOpts();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['blocks', 'u1'], [
      { userId: 'u2', scope: 'profile_only' },
    ]);

    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
      .onRawInsert as (msg: any) => void;
    const msg = { id: 'blocked-msg', user_id: 'u2', chat_id: 'chat-1' };

    act(() => {
      onRawInsert(msg);
    });

    expect(mockPrepend).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['global-unread-count', 'u1'] })
    );
  });

  it('invalidates chat-messages queries when AppState becomes active', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, makeOpts()), {
      wrapper: createWrapper(),
    });

    const appStateCb = addEventListenerSpy.mock.calls[0][1] as (state: string) => void;
    act(() => { appStateCb('active'); });
    act(() => { jest.runAllTimers(); });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['chat-messages', 'chat-1'] })
    );
  });

  describe('anonymous chats', () => {
    it('passes isAnonymous through to subscribeToChatMessages', () => {
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', true, makeOpts()), {
        wrapper: createWrapper(),
      });
      expect(mockSubscribe).toHaveBeenCalledWith(
        'chat-1',
        'u1',
        true,
        expect.any(Object),
      );
    });

    it('prepends an incoming message without needing a user_id self-check (delivery itself implies "not mine")', () => {
      const opts = makeOpts();
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', true, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      // Anonymous broadcast payloads never carry user_id at all.
      const msg = { id: 'new-m', chat_id: 'chat-1', content: 'hi' };
      act(() => {
        onRawInsert(msg);
      });

      expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', msg);
    });

    it('marks read via mark_anonymous_chat_read RPC, not a direct table update', () => {
      mockRpc.mockResolvedValue({ error: null });
      const opts = makeOpts();
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', true, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      act(() => {
        onRawInsert({ id: 'new-m', chat_id: 'chat-1', content: 'hi' });
      });

      expect(mockRpc).toHaveBeenCalledWith('mark_anonymous_chat_read', {
        p_chat_id: 'chat-1',
      });
    });
  });
});
