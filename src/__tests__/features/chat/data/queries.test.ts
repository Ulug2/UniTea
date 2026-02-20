jest.mock('../../../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../../../../lib/supabase';
import {
  fetchChat,
  fetchChatMessagesPage,
  MESSAGES_PER_PAGE_DEFAULT,
} from '../../../../features/chat/data/queries';

const mockFrom = supabase.from as jest.Mock;

function buildChain(terminalResult: { data?: any; error: any }) {
  const chain: Record<string, any> = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'not', 'or', 'order', 'range', 'limit'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(terminalResult);
  chain['maybeSingle'] = jest.fn().mockResolvedValue(terminalResult);
  Object.defineProperty(chain, 'then', {
    get: () => {
      const p = Promise.resolve(terminalResult);
      return p.then.bind(p);
    },
    configurable: true,
  });
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MESSAGES_PER_PAGE_DEFAULT', () => {
  it('is 20', () => {
    expect(MESSAGES_PER_PAGE_DEFAULT).toBe(20);
  });
});

describe('fetchChat', () => {
  const chatId = 'chat-123';

  it('returns the chat row on success', async () => {
    const fakeChat = { id: chatId, created_at: '2026-01-01' };
    const chain = buildChain({ data: fakeChat, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await fetchChat(chatId);

    expect(mockFrom).toHaveBeenCalledWith('chats');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', chatId);
    expect(result).toEqual(fakeChat);
  });

  it('returns null when data is null and no error', async () => {
    const chain = buildChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const result = await fetchChat(chatId);
    expect(result).toBeNull();
  });

  it('throws the supabase error when error is present', async () => {
    const dbError = new Error('not found');
    const chain = buildChain({ data: null, error: dbError });
    mockFrom.mockReturnValueOnce(chain);

    await expect(fetchChat(chatId)).rejects.toThrow('not found');
  });
});

describe('fetchChatMessagesPage', () => {
  const chatId = 'chat-abc';

  function buildListChain(data: any[], error: any = null) {
    const chain: Record<string, any> = {};
    ['select', 'eq', 'order', 'range'].forEach((m) => {
      chain[m] = jest.fn().mockReturnValue(chain);
    });
    Object.defineProperty(chain, 'then', {
      get: () => {
        const p = Promise.resolve({ data, error });
        return p.then.bind(p);
      },
      configurable: true,
    });
    return chain;
  }

  it('returns messages array on success', async () => {
    const messages = [
      { id: 'm1', chat_id: chatId, created_at: '2026-01-02' },
      { id: 'm2', chat_id: chatId, created_at: '2026-01-01' },
    ];
    const chain = buildListChain(messages);
    mockFrom.mockReturnValueOnce(chain);

    const result = await fetchChatMessagesPage(chatId, 0, 20);

    expect(mockFrom).toHaveBeenCalledWith('chat_messages');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('chat_id', chatId);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual(messages);
  });

  it('returns empty array when data is null/empty', async () => {
    const chain = buildListChain(null as any);
    mockFrom.mockReturnValueOnce(chain);
    const result = await fetchChatMessagesPage(chatId, 0, 20);
    expect(result).toEqual([]);
  });

  it('throws supabase error when present', async () => {
    const chain = buildListChain([], new Error('db error'));
    mockFrom.mockReturnValueOnce(chain);
    await expect(fetchChatMessagesPage(chatId, 0, 20)).rejects.toThrow('db error');
  });

  describe('pagination — range calculation', () => {
    it('page 0 with pageSize 20 → range(0, 19)', async () => {
      const chain = buildListChain([]);
      mockFrom.mockReturnValueOnce(chain);
      await fetchChatMessagesPage(chatId, 0, 20);
      expect(chain.range).toHaveBeenCalledWith(0, 19);
    });

    it('page 1 with pageSize 20 → range(20, 39)', async () => {
      const chain = buildListChain([]);
      mockFrom.mockReturnValueOnce(chain);
      await fetchChatMessagesPage(chatId, 1, 20);
      expect(chain.range).toHaveBeenCalledWith(20, 39);
    });

    it('page 2 with pageSize 10 → range(20, 29)', async () => {
      const chain = buildListChain([]);
      mockFrom.mockReturnValueOnce(chain);
      await fetchChatMessagesPage(chatId, 2, 10);
      expect(chain.range).toHaveBeenCalledWith(20, 29);
    });

    it('page 0 with pageSize 5 → range(0, 4)', async () => {
      const chain = buildListChain([]);
      mockFrom.mockReturnValueOnce(chain);
      await fetchChatMessagesPage(chatId, 0, 5);
      expect(chain.range).toHaveBeenCalledWith(0, 4);
    });
  });
});
