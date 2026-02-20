/**
 * Tests for src/features/chat/hooks/useChatSendMessage.ts
 */

jest.mock('../../../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../../../../utils/supabaseImages', () => ({
  uploadImage: jest.fn(),
}));
jest.mock('../../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../features/chat/data/cache', () => ({
  addOptimisticMessage: jest.fn(),
  replaceOptimisticMessage: jest.fn(),
  markMessageFailed: jest.fn(),
  removeOptimisticMessage: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../../../../lib/supabase';
import { uploadImage } from '../../../../utils/supabaseImages';
import { useChatSendMessage } from '../../../../features/chat/hooks/useChatSendMessage';
import {
  addOptimisticMessage,
  replaceOptimisticMessage,
  markMessageFailed,
} from '../../../../features/chat/data/cache';

const mockFrom = supabase.from as jest.Mock;
const mockUploadImage = uploadImage as jest.Mock;
const mockAddOptimistic = addOptimisticMessage as jest.Mock;
const mockReplaceOptimistic = replaceOptimisticMessage as jest.Mock;
const mockMarkFailed = markMessageFailed as jest.Mock;

// Build a supabase query chain that resolves at .single()
function buildInsertChain(result: { data: any; error: any }) {
  const chain: Record<string, any> = {};
  ['insert', 'select', 'update', 'eq'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(result);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(result);
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

const fakeMessage = {
  id: 'real-msg-1',
  chat_id: 'chat-1',
  user_id: 'u1',
  content: 'hello',
  created_at: new Date().toISOString(),
  is_read: false,
  deleted_by_receiver: null,
  deleted_by_sender: null,
};

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeOptions() {
  return {
    pendingMessageIdsRef: { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    optimisticImageUrisRef: { current: new Map<string, string>() } as React.MutableRefObject<Map<string, string>>,
    flatListRef: { current: null } as React.RefObject<any>,
    onRestoreInput: jest.fn(),
  };
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  // Default: two successful chain calls (chat_messages insert + chats update)
  const insertChain = buildInsertChain({ data: fakeMessage, error: null });
  const updateChain = buildInsertChain({ data: null, error: null });
  mockFrom
    .mockReturnValueOnce(insertChain)
    .mockReturnValueOnce(updateChain);

  mockUploadImage.mockResolvedValue('https://storage.example.com/image.webp');
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe('useChatSendMessage', () => {
  describe('early returns', () => {
    it('does not call supabase when chatId is empty', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('', 'u1', opts), {
        wrapper: createWrapper(),
      });
      await act(async () => {
        await result.current.send({ text: 'hello' });
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('does not call supabase when currentUserId is undefined', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', undefined, opts), {
        wrapper: createWrapper(),
      });
      await act(async () => {
        await result.current.send({ text: 'hello' });
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('does nothing when text is empty and no image', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });
      await act(async () => {
        await result.current.send({ text: '' });
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('happy path — text message', () => {
    it('calls addOptimisticMessage then replaceOptimisticMessage on success', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.send({ text: 'hello' });
      });

      await waitFor(() => {
        expect(mockAddOptimistic).toHaveBeenCalled();
        expect(mockReplaceOptimistic).toHaveBeenCalled();
      });
    });

    it('inserts into chat_messages with correct fields', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.send({ text: 'hello world' });
      });

      await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('chat_messages'));
    });
  });

  describe('happy path — image message', () => {
    it('calls uploadImage first then inserts message with image_url', async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.send({ text: '', localImageUri: 'file://photo.jpg' });
      });

      await waitFor(() => {
        expect(mockUploadImage).toHaveBeenCalledWith('file://photo.jpg', supabase, 'chat-images');
        expect(mockFrom).toHaveBeenCalledWith('chat_messages');
      });
    });

    it('shows alert and returns early when uploadImage fails', async () => {
      mockUploadImage.mockRejectedValue(new Error('upload failed'));
      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.send({ text: 'hi', localImageUri: 'file://bad.jpg' });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      // No supabase insert should happen
      expect(mockFrom).not.toHaveBeenCalledWith('chat_messages');
    });
  });

  describe('client-side rate limit', () => {
    it('shows rate limit Alert after 10 messages in 60s', async () => {
      // Provide unlimited successful chains (10 messages × 2 from() calls each)
      mockFrom.mockImplementation(() =>
        buildInsertChain({ data: fakeMessage, error: null })
      );
      // Server-side rate limit check uses supabase.rpc — return a non-limited result
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: { is_rate_limited: false },
        error: null,
      });

      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      // Send 10 messages sequentially — all within the same 60s window
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          await result.current.send({ text: `msg ${i}` });
        });
        // Wait for isSendingRef to be released before next iteration
        await waitFor(() => expect(result.current.isSending).toBe(false));
      }

      // Re-apply spy after the loop (clearAllMocks may have run)
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      mockFrom.mockImplementation(() =>
        buildInsertChain({ data: fakeMessage, error: null })
      );

      // 11th message should trigger client-side rate limit (Alert.alert 'Rate Limit')
      await act(async () => {
        await result.current.send({ text: 'rate limited' });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Rate Limit', expect.any(String), expect.any(Array));
    });
  });

  describe('error handling', () => {
    it('calls markMessageFailed on supabase insert error containing network-like message', async () => {
      const networkErr = Object.assign(new Error('network timeout'), {});
      const failChain = buildInsertChain({ data: null, error: networkErr });
      mockFrom.mockReset();
      mockFrom.mockReturnValue(failChain);

      const opts = makeOptions();
      const { result } = renderHook(() => useChatSendMessage('chat-1', 'u1', opts), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.send({ text: 'hello' });
      });

      await waitFor(() => {
        expect(mockMarkFailed).toHaveBeenCalled();
      });
    });
  });
});
