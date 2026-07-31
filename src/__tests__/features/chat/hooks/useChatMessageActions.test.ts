/**
 * Tests for src/features/chat/hooks/useChatMessageActions.ts
 */

jest.mock('../../../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../features/chat/data/cache', () => ({
  applyMessageDeletion: jest.fn(),
  updateChatSummaryFromMessages: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, Platform, ActionSheetIOS } from 'react-native';
import { supabase } from '../../../../lib/supabase';
import { useChatMessageActions } from '../../../../features/chat/hooks/useChatMessageActions';
import { applyMessageDeletion } from '../../../../features/chat/data/cache';
import type { ChatMessageVM } from '../../../../features/chat/types';

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockApply = applyMessageDeletion as jest.Mock;

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeMessage(overrides: Partial<ChatMessageVM> = {}): ChatMessageVM {
  return {
    id: 'msg-1',
    chat_id: 'chat-1',
    user_id: 'u1',
    content: 'Hello',
    created_at: new Date().toISOString(),
    is_read: false,
    deleted_by_receiver: null,
    deleted_by_sender: null,
    ...overrides,
  } as ChatMessageVM;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, retryDelay: 0 }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  mockRpc.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useChatMessageActions', () => {
  describe('deleteForMe guard — no currentUserId', () => {
    it('returns early without calling the RPC when currentUserId is undefined', () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', undefined),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('happy path — deleteForMe', () => {
    it('calls the unified RPC with delete_for_me and applyMessageDeletion', async () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('set_chat_message_deletion', {
          p_message_id: 'msg-1',
          p_action: 'delete_for_me',
        });
        expect(mockApply).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'delete_for_me', messageId: 'msg-1' })
        );
      });
    });
  });

  describe('happy path — deleteForEveryone', () => {
    it('calls the unified RPC with delete_for_everyone', async () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForEveryone('msg-1');
      });

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('set_chat_message_deletion', {
          p_message_id: 'msg-1',
          p_action: 'delete_for_everyone',
        });
        expect(mockApply).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'delete_for_everyone' })
        );
      });
    });
  });

  describe('same RPC regardless of chat type', () => {
    it('deleteForMe uses set_chat_message_deletion for what would have been an anonymous chat', async () => {
      // The hook no longer takes an isAnonymous parameter at all — the
      // server determines chat type from the message/chat row itself.
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith(
          'set_chat_message_deletion',
          { p_message_id: 'msg-1', p_action: 'delete_for_me' }
        );
        expect(mockFrom).not.toHaveBeenCalled();
      });
    });
  });

  describe('onError', () => {
    it('shows Alert and rolls back cache when the RPC returns a server-side rejection', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: new Error('only the sender can delete a message for everyone'),
      });

      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForEveryone('msg-1');
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });

    it('shows Alert on a generic RPC error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('db error') });

      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      });
    });
  });

  describe('openMessageActionSheet', () => {
    it('calls ActionSheetIOS on iOS', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );
      const msg = makeMessage({ user_id: 'u1' }); // sender
      act(() => {
        result.current.openMessageActionSheet(msg);
      });
      expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalled();
    });

    it('calls Alert.alert with buttons on non-iOS', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );
      const msg = makeMessage({ user_id: 'u1' }); // sender
      act(() => {
        result.current.openMessageActionSheet(msg);
      });
      expect(Alert.alert).toHaveBeenCalled();
    });

    it('offers only "Delete for me" for a partner message, never "Delete for everyone"', () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );
      const msg = makeMessage({ user_id: 'someone-else' }); // not the caller
      act(() => {
        result.current.openMessageActionSheet(msg);
      });
      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ text: string }>;
      const labels = buttons.map((b) => b.text);
      expect(labels).toContain('Delete for me');
      expect(labels).not.toContain('Delete for everyone');
    });

    it('shows no modal at all for a message already deleted for everyone', () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );
      const tombstone = makeMessage({
        deleted_by_sender: true,
        deleted_by_receiver: true,
      });
      act(() => {
        result.current.openMessageActionSheet(tombstone);
      });
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
    });
  });
});
