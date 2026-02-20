/**
 * Tests for src/features/chat/data/cache.ts
 *
 * Uses a real QueryClient — cache functions are pure data transforms.
 */

import { QueryClient } from '@tanstack/react-query';
import {
  addOptimisticMessage,
  replaceOptimisticMessage,
  markMessageFailed,
  removeOptimisticMessage,
  prependMessage,
  prependIncomingMessage,
  applyMessageDeletion,
} from '../../../../features/chat/data/cache';
import type { ChatMessageVM, MessagesQueryData } from '../../../../features/chat/types';

const CHAT_ID = 'chat-001';
const QUERY_KEY = ['chat-messages', CHAT_ID];

function makeMsg(id: string, overrides: Partial<ChatMessageVM> = {}): ChatMessageVM {
  return {
    id,
    chat_id: CHAT_ID,
    user_id: 'user-1',
    content: `Message ${id}`,
    created_at: new Date().toISOString(),
    is_read: false,
    deleted_by_receiver: null,
    deleted_by_sender: null,
    ...overrides,
  } as ChatMessageVM;
}

function getPages(qc: QueryClient): ChatMessageVM[][] {
  const data = qc.getQueryData<MessagesQueryData>(QUERY_KEY);
  return data?.pages ?? [];
}

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  qc.clear();
});

// ── prependMessage (pure helper) ──────────────────────────────────────────────

describe('prependMessage', () => {
  it('creates initial structure when oldData is undefined', () => {
    const msg = makeMsg('m1');
    const result = prependMessage(undefined, msg);
    expect(result.pages[0][0]).toEqual(msg);
  });

  it('prepends to the first page', () => {
    const old: MessagesQueryData = { pages: [[makeMsg('m2')]], pageParams: [0] };
    const newMsg = makeMsg('m1');
    const result = prependMessage(old, newMsg);
    expect(result.pages[0][0].id).toBe('m1');
    expect(result.pages[0][1].id).toBe('m2');
  });

  it('preserves additional pages unchanged', () => {
    const old: MessagesQueryData = {
      pages: [[makeMsg('m1')], [makeMsg('m2')]],
      pageParams: [0, 1],
    };
    const result = prependMessage(old, makeMsg('m0'));
    expect(result.pages[1][0].id).toBe('m2');
  });
});

// ── addOptimisticMessage ──────────────────────────────────────────────────────

describe('addOptimisticMessage', () => {
  it('adds message to cache with sendStatus "sending"', () => {
    const msg = makeMsg('temp-1', { sendStatus: 'sending' });
    addOptimisticMessage(qc, CHAT_ID, msg);
    expect(getPages(qc)[0][0].id).toBe('temp-1');
    expect(getPages(qc)[0][0].sendStatus).toBe('sending');
  });

  it('seeds initial structure when no existing data', () => {
    const msg = makeMsg('temp-new', { sendStatus: 'sending' });
    addOptimisticMessage(qc, CHAT_ID, msg);
    const data = qc.getQueryData<MessagesQueryData>(QUERY_KEY);
    expect(data?.pages).toHaveLength(1);
    expect(data?.pages[0][0].id).toBe('temp-new');
  });
});

// ── replaceOptimisticMessage ──────────────────────────────────────────────────

describe('replaceOptimisticMessage', () => {
  it('replaces the temp message with confirmed message', () => {
    const tempMsg = makeMsg('temp-1', { sendStatus: 'sending' });
    addOptimisticMessage(qc, CHAT_ID, tempMsg);
    const confirmed = makeMsg('real-1');
    replaceOptimisticMessage(qc, CHAT_ID, 'temp-1', confirmed);
    const pages = getPages(qc);
    expect(pages[0].find((m) => m.id === 'temp-1')).toBeUndefined();
    expect(pages[0].find((m) => m.id === 'real-1')).toBeDefined();
  });

  it('clears sendStatus on the replaced message', () => {
    const tempMsg = makeMsg('temp-2', { sendStatus: 'sending' });
    addOptimisticMessage(qc, CHAT_ID, tempMsg);
    const confirmed = makeMsg('real-2');
    replaceOptimisticMessage(qc, CHAT_ID, 'temp-2', confirmed);
    const replaced = getPages(qc)[0].find((m) => m.id === 'real-2');
    expect(replaced?.sendStatus).toBeUndefined();
  });
});

// ── markMessageFailed ─────────────────────────────────────────────────────────

describe('markMessageFailed', () => {
  it('sets sendStatus to "failed" on the matching tempId row', () => {
    const tempMsg = makeMsg('temp-3', { sendStatus: 'sending' });
    addOptimisticMessage(qc, CHAT_ID, tempMsg);
    markMessageFailed(qc, CHAT_ID, 'temp-3');
    const msg = getPages(qc)[0].find((m) => m.id === 'temp-3');
    expect(msg?.sendStatus).toBe('failed');
  });

  it('leaves other messages unchanged', () => {
    const m1 = makeMsg('m-a', { sendStatus: 'sending' });
    const m2 = makeMsg('m-b');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1, m2]], pageParams: [0] });
    markMessageFailed(qc, CHAT_ID, 'm-a');
    expect(getPages(qc)[0].find((m) => m.id === 'm-b')?.sendStatus).toBeUndefined();
  });
});

// ── removeOptimisticMessage ────────────────────────────────────────────────────

describe('removeOptimisticMessage', () => {
  it('removes the message by id', () => {
    const m1 = makeMsg('rem-1');
    const m2 = makeMsg('rem-2');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1, m2]], pageParams: [0] });
    removeOptimisticMessage(qc, CHAT_ID, 'rem-1');
    const ids = getPages(qc)[0].map((m) => m.id);
    expect(ids).not.toContain('rem-1');
    expect(ids).toContain('rem-2');
  });
});

// ── prependIncomingMessage ─────────────────────────────────────────────────────

describe('prependIncomingMessage', () => {
  it('prepends to first page', () => {
    const m1 = makeMsg('old-1');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    const incoming = makeMsg('new-1');
    prependIncomingMessage(qc, CHAT_ID, incoming);
    expect(getPages(qc)[0][0].id).toBe('new-1');
  });

  it('does not duplicate an existing message', () => {
    const m1 = makeMsg('exist-1');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    prependIncomingMessage(qc, CHAT_ID, m1);
    expect(getPages(qc)[0].filter((m) => m.id === 'exist-1')).toHaveLength(1);
  });
});

// ── applyMessageDeletion ──────────────────────────────────────────────────────

describe('applyMessageDeletion', () => {
  it('"delete_for_me" removes the message from cache', () => {
    const m1 = makeMsg('del-1');
    const m2 = makeMsg('del-2');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1, m2]], pageParams: [0] });
    applyMessageDeletion({ queryClient: qc, chatId: CHAT_ID, messageId: 'del-1', action: 'delete_for_me', isSender: true });
    expect(getPages(qc)[0].find((m) => m.id === 'del-1')).toBeUndefined();
    expect(getPages(qc)[0].find((m) => m.id === 'del-2')).toBeDefined();
  });

  it('"delete_for_everyone" sets deleted_for_everyone flags on the message', () => {
    const m1 = makeMsg('del-for-all');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    applyMessageDeletion({ queryClient: qc, chatId: CHAT_ID, messageId: 'del-for-all', action: 'delete_for_everyone', isSender: true });
    const msg = getPages(qc)[0].find((m) => m.id === 'del-for-all');
    expect(msg?.deleted_by_sender).toBe(true);
    expect(msg?.deleted_by_receiver).toBe(true);
  });
});
