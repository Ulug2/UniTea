/**
 * Tests for src/features/chat/hooks/useChatMessageActions.ts
 */

jest.mock('../../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../features/chat/data/cache', () => ({
  applyMessageDeletion: jest.fn(),
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
const mockApply = applyMessageDeletion as jest.Mock;

function buildUpdateChain(error: any = null) {
  const chain: Record<string, any> = {};
  ['update', 'eq', 'select'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve({ data: null, error });
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

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
  const chain = buildUpdateChain();
  mockFrom.mockReturnValue(chain);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useChatMessageActions', () => {
  describe('deleteForMe guard — no currentUserId', () => {
    it('returns early without calling supabase when currentUserId is undefined', () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', undefined),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('happy path — deleteForMe', () => {
    it('calls supabase update and applyMessageDeletion', async () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForMe('msg-1', true);
      });

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('chat_messages');
        expect(mockApply).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'delete_for_me', messageId: 'msg-1' })
        );
      });
    });
  });

  describe('happy path — deleteForEveryone', () => {
    it('calls supabase update for delete_for_everyone', async () => {
      const { result } = renderHook(
        () => useChatMessageActions('chat-1', 'u1'),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.deleteForEveryone('msg-1');
      });

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('chat_messages');
        expect(mockApply).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'delete_for_everyone' })
        );
      });
    });
  });

  describe('onError', () => {
    it('shows Alert on supabase error', async () => {
      const chain = buildUpdateChain(new Error('db error'));
      mockFrom.mockReturnValue(chain);

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
  });
});
