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
  applyIncomingMessageUpdate: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useChatMessagesRealtime } from '../../../../features/chat/hooks/useChatMessagesRealtime';
import { subscribeToChatMessages } from '../../../../features/chat/data/realtime';
import {
  prependIncomingMessage,
  applyIncomingMessageUpdate,
} from '../../../../features/chat/data/cache';
import { supabase } from '../../../../lib/supabase';

const mockSubscribe = subscribeToChatMessages as jest.Mock;
const mockPrepend = prependIncomingMessage as jest.Mock;
const mockApplyUpdate = applyIncomingMessageUpdate as jest.Mock;
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

  describe('reply preview flicker fix', () => {
    it('attaches a replyToMessage snapshot from cache when the original is already loaded', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[{
          id: 'orig-1',
          chat_id: 'chat-1',
          user_id: 'u2',
          content: 'the original text',
          image_url: null,
          deleted_by_sender: null,
          deleted_by_receiver: null,
        }]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      const msg = { id: 'reply-1', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'orig-1' };
      act(() => {
        onRawInsert(msg);
      });

      expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', {
        ...msg,
        replyToMessage: {
          id: 'orig-1',
          content: 'the original text',
          image_url: null,
          user_id: 'u2',
          deleted_by_sender: null,
          deleted_by_receiver: null,
        },
      });
    });

    it('attaches an image reply preview correctly (content null, image_url set)', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[{
          id: 'orig-img',
          chat_id: 'chat-1',
          user_id: 'u2',
          content: null,
          image_url: 'chat-images/photo.jpg',
          deleted_by_sender: null,
          deleted_by_receiver: null,
        }]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      const msg = { id: 'reply-img', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'orig-img' };
      act(() => {
        onRawInsert(msg);
      });

      const prependedMsg = mockPrepend.mock.calls[0][2];
      expect(prependedMsg.replyToMessage.image_url).toBe('chat-images/photo.jpg');
      expect(prependedMsg.replyToMessage.content).toBeNull();
    });

    it('carries deleted-for-everyone state into the reply preview when the quoted original is a tombstone', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[{
          id: 'orig-deleted',
          chat_id: 'chat-1',
          user_id: 'u2',
          content: 'This message was deleted',
          image_url: null,
          deleted_by_sender: true,
          deleted_by_receiver: true,
        }]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      const msg = { id: 'reply-to-deleted', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'orig-deleted' };
      act(() => {
        onRawInsert(msg);
      });

      const prependedMsg = mockPrepend.mock.calls[0][2];
      expect(prependedMsg.replyToMessage.deleted_by_sender).toBe(true);
      expect(prependedMsg.replyToMessage.deleted_by_receiver).toBe(true);
    });

    it('leaves the message unchanged (no replyToMessage) when the original is not in the local cache — enrichment still resolves it separately', () => {
      const opts = makeOpts();
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      const msg = { id: 'reply-2', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'not-cached' };
      act(() => {
        onRawInsert(msg);
      });

      expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', msg);
    });

    it('does not touch messages that already carry a replyToMessage (e.g. an anonymous broadcast payload with pre-attached data)', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[{ id: 'orig-3', chat_id: 'chat-1', user_id: 'u2', content: 'ignored', image_url: null }]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      const msg = {
        id: 'reply-3',
        user_id: 'u2',
        chat_id: 'chat-1',
        reply_to_id: 'orig-3',
        replyToMessage: { id: 'orig-3', content: 'already attached', image_url: null, user_id: 'u2' },
      };
      act(() => {
        onRawInsert(msg);
      });

      expect(mockPrepend).toHaveBeenCalledWith(queryClient, 'chat-1', msg);
    });

    it('works for anonymous chats too (broadcast payload with reply_to_id, original already cached)', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[{
          id: 'anon-orig',
          chat_id: 'chat-1',
          user_id: 'u1',
          content: 'my earlier message',
          image_url: null,
          deleted_by_sender: null,
          deleted_by_receiver: null,
        }]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', true, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      // Anonymous broadcast payloads never carry user_id at all.
      const msg = { id: 'anon-reply', chat_id: 'chat-1', reply_to_id: 'anon-orig' };
      act(() => {
        onRawInsert(msg);
      });

      const prependedMsg = mockPrepend.mock.calls[0][2];
      expect(prependedMsg.replyToMessage.content).toBe('my earlier message');
    });

    it('handles rapid consecutive replies to different originals without cross-contamination', () => {
      const opts = makeOpts();
      queryClient.setQueryData(['chat-messages', 'chat-1'], {
        pages: [[
          { id: 'rapid-orig-a', chat_id: 'chat-1', user_id: 'u2', content: 'A', image_url: null },
          { id: 'rapid-orig-b', chat_id: 'chat-1', user_id: 'u2', content: 'B', image_url: null },
        ]],
        pageParams: [0],
      });
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
        wrapper: createWrapper(),
      });

      const onRawInsert = (mockSubscribe.mock.calls[0][3] as any)
        .onRawInsert as (msg: any) => void;
      act(() => {
        onRawInsert({ id: 'reply-a', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'rapid-orig-a' });
        onRawInsert({ id: 'reply-b', user_id: 'u2', chat_id: 'chat-1', reply_to_id: 'rapid-orig-b' });
      });

      expect(mockPrepend.mock.calls[0][2].replyToMessage.content).toBe('A');
      expect(mockPrepend.mock.calls[1][2].replyToMessage.content).toBe('B');
    });
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

  it('calls applyIncomingMessageUpdate when onMessageUpdate fires (non-anonymous, deletion)', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onMessageUpdate = (mockSubscribe.mock.calls[0][3] as any)
      .onMessageUpdate as (update: any) => void;
    const update = {
      id: 'm1',
      chat_id: 'chat-1',
      user_id: 'u2',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    };
    act(() => {
      onMessageUpdate(update);
    });

    expect(mockApplyUpdate).toHaveBeenCalledWith(queryClient, 'chat-1', update);
  });

  it('applies onMessageUpdate even for a self-echo (sender receiving their own delete-for-everyone UPDATE) — idempotent, no special-casing needed', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onMessageUpdate = (mockSubscribe.mock.calls[0][3] as any)
      .onMessageUpdate as (update: any) => void;
    // user_id === currentUserId ('u1') — this is the sender's own message.
    const selfEcho = {
      id: 'm1',
      chat_id: 'chat-1',
      user_id: 'u1',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    };
    act(() => {
      onMessageUpdate(selfEcho);
    });

    expect(mockApplyUpdate).toHaveBeenCalledWith(queryClient, 'chat-1', selfEcho);
  });

  it('does NOT prepend or scroll for onMessageUpdate — a deletion is not new content', () => {
    const opts = makeOpts();
    renderHook(() => useChatMessagesRealtime('chat-1', 'u1', false, opts), {
      wrapper: createWrapper(),
    });

    const onMessageUpdate = (mockSubscribe.mock.calls[0][3] as any)
      .onMessageUpdate as (update: any) => void;
    act(() => {
      onMessageUpdate({ id: 'm1', deleted_by_sender: true, deleted_by_receiver: true });
    });

    expect(mockPrepend).not.toHaveBeenCalled();
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

    it('applies a minimal deletion payload (no chat_id/user_id, per the anonymous broadcast) via applyIncomingMessageUpdate', () => {
      const opts = makeOpts();
      renderHook(() => useChatMessagesRealtime('chat-1', 'u1', true, opts), {
        wrapper: createWrapper(),
      });

      const onMessageUpdate = (mockSubscribe.mock.calls[0][3] as any)
        .onMessageUpdate as (update: any) => void;
      const update = { id: 'm1', deleted_by_sender: true, deleted_by_receiver: true };
      act(() => {
        onMessageUpdate(update);
      });

      expect(mockApplyUpdate).toHaveBeenCalledWith(queryClient, 'chat-1', update);
    });
  });
});
