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

import { getNotificationData, routeFromNotification } from '../../hooks/usePushNotifications';
import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';

const mockFrom = supabase.from as jest.Mock;

function buildNotification(data: Record<string, unknown>) {
  return {
    request: { content: { data }, trigger: null },
  } as any;
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

      expect(mockRouterPush).toHaveBeenCalledWith('/post/post-1');
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
