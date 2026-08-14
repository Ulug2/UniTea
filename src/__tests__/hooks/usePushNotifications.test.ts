/**
 * Tests for the notification-routing logic in src/hooks/usePushNotifications.ts
 * — getNotificationData (payload parsing) and routeFromNotification
 * (tap-to-navigate). This is the "receive + tap to navigate" half of P2
 * Feature 27; the registration/permission side (usePushNotifications() the
 * hook itself) is native-device-dependent and verified manually.
 */
const mockRouterNavigate = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    navigate: (...args: unknown[]) => mockRouterNavigate(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

import { renderHook, act } from '@testing-library/react-native';
import {
  getNotificationData,
  routeFromNotification,
  handleNotificationResponse,
  useNotificationChatNavGuard,
} from '../../hooks/usePushNotifications';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

const mockFrom = supabase.from as jest.Mock;

function buildNotification(data: Record<string, unknown>, identifier?: string) {
  return {
    request: { identifier, content: { data }, trigger: null },
  } as any;
}

/** Wraps a Notification in the NotificationResponse shape handleNotificationResponse expects. */
function buildResponse(notification: any) {
  return { notification, actionIdentifier: 'default' } as any;
}

function buildRemoteNotification(remoteData: Record<string, string>) {
  return {
    request: {
      content: { data: undefined },
      trigger: { remoteMessage: { data: remoteData } },
    },
  } as any;
}

/** A maybeSingle() chain that resolves to `result` once. */
function buildLookupChain(result: { data: unknown }) {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getNotificationData', () => {
  it('reads fields from content.data when present', () => {
    const notification = buildNotification({
      type: 'chat_message',
      relatedUserId: 'u1',
      relatedPostId: 'p1',
      relatedChatId: 'c1',
    });

    expect(getNotificationData(notification)).toEqual({
      type: 'chat_message',
      relatedUserId: 'u1',
      relatedPostId: 'p1',
      relatedChatId: 'c1',
    });
  });

  it('falls back to trigger.remoteMessage.data when content.data is absent', () => {
    const notification = buildRemoteNotification({
      type: 'upvote',
      relatedPostId: 'p2',
    });

    expect(getNotificationData(notification)).toMatchObject({
      type: 'upvote',
      relatedPostId: 'p2',
    });
  });

  it('accepts either relatedChatId or the snake_case related_chat_id key', () => {
    const camel = buildNotification({ relatedChatId: 'c1' });
    const snake = buildNotification({ related_chat_id: 'c2' });

    expect(getNotificationData(camel).relatedChatId).toBe('c1');
    expect(getNotificationData(snake).relatedChatId).toBe('c2');
  });
});

describe('routeFromNotification', () => {
  describe('type: chat_message', () => {
    it('switches to the Chats tab and pushes directly to the chat when relatedChatId is present', async () => {
      const notification = buildNotification({ type: 'chat_message', relatedChatId: 'chat-1' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterNavigate).toHaveBeenCalledWith('/chat');
      expect(mockRouterPush).toHaveBeenCalledWith('/chat/chat-1');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('resolves the chat id from participants when only relatedUserId is present (p1/p2 order)', async () => {
      const notFound = buildLookupChain({ data: null });
      const found = buildLookupChain({ data: { chat_id: 'resolved-chat' } });
      mockFrom.mockReturnValueOnce(notFound).mockReturnValueOnce(found);

      const notification = buildNotification({ type: 'chat_message', relatedUserId: 'them' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).toHaveBeenCalledWith('/chat/resolved-chat');
    });

    it('resolves the chat id when the current user is participant_1 on the first lookup', async () => {
      const found = buildLookupChain({ data: { chat_id: 'resolved-chat' } });
      mockFrom.mockReturnValueOnce(found);

      const notification = buildNotification({ type: 'chat_message', relatedUserId: 'them' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).toHaveBeenCalledWith('/chat/resolved-chat');
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('stays on the Chats tab and logs a warning when neither relatedChatId nor relatedUserId is present', async () => {
      const notification = buildNotification({ type: 'chat_message' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterNavigate).toHaveBeenCalledWith('/chat');
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('stays on the Chats tab and logs a warning when the chat cannot be resolved from participants', async () => {
      const notFound1 = buildLookupChain({ data: null });
      const notFound2 = buildLookupChain({ data: null });
      mockFrom.mockReturnValueOnce(notFound1).mockReturnValueOnce(notFound2);

      const notification = buildNotification({ type: 'chat_message', relatedUserId: 'them' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('type: upvote / comment_reply', () => {
    it('pushes directly to the post when relatedPostId is present', async () => {
      const notification = buildNotification({ type: 'upvote', relatedPostId: 'post-1' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).toHaveBeenCalledWith('/post/post-1?fromDeeplink=1');
    });

    it('marks the comment_reply destination as external entry too (Phase 3.1C)', async () => {
      const notification = buildNotification({ type: 'comment_reply', relatedPostId: 'post-2' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).toHaveBeenCalledWith('/post/post-2?fromDeeplink=1');
    });

    it('falls back to the feed root and logs a warning when relatedPostId is missing', async () => {
      const notification = buildNotification({ type: 'comment_reply' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterPush).toHaveBeenCalledWith('/');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('unknown notification type', () => {
    it('logs a warning and does not navigate anywhere', async () => {
      const notification = buildNotification({ type: 'something_new' });

      await routeFromNotification(notification, 'me');

      expect(mockRouterNavigate).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});

/**
 * useNotificationChatNavGuard / handleNotificationResponse — the P0
 * warm-resume privacy guard. True from the instant a notification tap
 * begins routing until it finishes (success, failure, or an invalid/
 * malformed payload), so chat/[id].tsx can cover an already-open chat's
 * content instead of exposing it while a DIFFERENT chat's notification is
 * still resolving. See usePushNotifications.ts for the full design note.
 */
describe('notification chat-nav guard', () => {
  /** A maybeSingle() chain whose resolution the test controls explicitly. */
  function buildDeferredLookupChain() {
    let resolve!: (result: { data: unknown }) => void;
    const promise = new Promise<{ data: unknown }>((r) => {
      resolve = r;
    });
    const chain: Record<string, any> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockReturnValue(promise);
    return { chain, resolve };
  }

  it('is false before any notification has been handled', () => {
    const { result } = renderHook(() => useNotificationChatNavGuard());
    expect(result.current).toBe(false);
  });

  it('is true synchronously once handling begins and false once a direct relatedChatId route settles', async () => {
    const { result } = renderHook(() => useNotificationChatNavGuard());
    const response = buildResponse(
      buildNotification({ type: 'chat_message', relatedChatId: 'chat-1' }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      await pending;
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).toHaveBeenCalledWith('/chat/chat-1');
  });

  it('is true then false when the payload is invalid/malformed (no relatedChatId or relatedUserId)', async () => {
    const { result } = renderHook(() => useNotificationChatNavGuard());
    const response = buildResponse(buildNotification({ type: 'chat_message' }));

    let pending!: Promise<void>;
    act(() => {
      pending = handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      await pending;
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('stays true across the relatedUserId -> chat id database lookup and clears once it resolves', async () => {
    const { chain, resolve } = buildDeferredLookupChain();
    mockFrom.mockReturnValueOnce(chain);

    const { result } = renderHook(() => useNotificationChatNavGuard());
    const response = buildResponse(
      buildNotification({ type: 'chat_message', relatedUserId: 'them' }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      resolve({ data: { chat_id: 'resolved-chat' } });
      await pending;
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).toHaveBeenCalledWith('/chat/resolved-chat');
  });

  it('clears even when the lookup fails to resolve a chat id', async () => {
    const notFound1 = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
    notFound1.select.mockReturnValue(notFound1);
    notFound1.eq.mockReturnValue(notFound1);
    notFound1.maybeSingle.mockResolvedValue({ data: null });
    const notFound2 = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
    notFound2.select.mockReturnValue(notFound2);
    notFound2.eq.mockReturnValue(notFound2);
    notFound2.maybeSingle.mockResolvedValue({ data: null });
    mockFrom.mockReturnValueOnce(notFound1).mockReturnValueOnce(notFound2);

    const { result } = renderHook(() => useNotificationChatNavGuard());
    const response = buildResponse(
      buildNotification({ type: 'chat_message', relatedUserId: 'them' }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      await pending;
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('clears even when routing throws', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('unexpected db error');
    });

    const { result } = renderHook(() => useNotificationChatNavGuard());
    const response = buildResponse(
      buildNotification({ type: 'chat_message', relatedUserId: 'them' }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(true);

    await act(async () => {
      await expect(pending).rejects.toThrow('unexpected db error');
    });
    expect(result.current).toBe(false);
  });

  it('stays true while a second notification is still resolving even after the first (rapid, faster) one finishes, and only clears once both are done', async () => {
    const { chain: slowChain, resolve: resolveSlow } = buildDeferredLookupChain();
    mockFrom.mockReturnValueOnce(slowChain);

    const { result } = renderHook(() => useNotificationChatNavGuard());

    const slowResponse = buildResponse(
      buildNotification({ type: 'chat_message', relatedUserId: 'slow-user' }, 'id-slow'),
    );
    const fastResponse = buildResponse(
      buildNotification({ type: 'chat_message', relatedChatId: 'fast-chat' }, 'id-fast'),
    );

    let pendingSlow!: Promise<void>;
    act(() => {
      pendingSlow = handleNotificationResponse(slowResponse, 'me');
    });
    expect(result.current).toBe(true);

    let pendingFast!: Promise<void>;
    await act(async () => {
      pendingFast = handleNotificationResponse(fastResponse, 'me');
      await pendingFast;
    });
    // The fast (direct relatedChatId) response finished, but the slow one's
    // database lookup is still pending — the guard must not have cleared.
    expect(result.current).toBe(true);
    expect(mockRouterPush).toHaveBeenCalledWith('/chat/fast-chat');

    await act(async () => {
      resolveSlow({ data: { chat_id: 'slow-chat' } });
      await pendingSlow;
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).toHaveBeenCalledWith('/chat/slow-chat');
  });

  it('does not process the same notification response twice (existing dedup), and does not leave the guard stuck from the skipped duplicate', async () => {
    const response = buildResponse(
      buildNotification({ type: 'chat_message', relatedChatId: 'chat-1' }, 'dup-id'),
    );

    const { result } = renderHook(() => useNotificationChatNavGuard());

    await act(async () => {
      await handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);

    // Second call with the same identifier is deduped and returns
    // immediately without ever touching the guard.
    await act(async () => {
      await handleNotificationResponse(response, 'me');
    });
    expect(result.current).toBe(false);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
  });
});
