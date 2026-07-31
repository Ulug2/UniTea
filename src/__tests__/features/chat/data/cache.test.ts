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
  upsertIncomingMessage,
  applyIncomingMessageUpdate,
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

// ── upsertIncomingMessage ─────────────────────────────────────────────────────
// (pre-existing function; these tests lock in its behavior across the
// mergeMessageIntoPages extraction so the shared refactor can't silently
// change it.)

describe('upsertIncomingMessage', () => {
  it('merges an update into an existing message in page[0]', () => {
    const m1 = makeMsg('u1', { content: 'original' });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    upsertIncomingMessage(qc, CHAT_ID, makeMsg('u1', { content: 'enriched' }));
    expect(getPages(qc)[0][0].content).toBe('enriched');
  });

  it('finds and merges a message on a page other than the first (fallback scan)', () => {
    const m1 = makeMsg('p0-msg');
    const m2 = makeMsg('p1-msg', { content: 'original' });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, {
      pages: [[m1], [m2]],
      pageParams: [0, 1],
    });
    upsertIncomingMessage(qc, CHAT_ID, makeMsg('p1-msg', { content: 'enriched' }));
    expect(getPages(qc)[1][0].content).toBe('enriched');
  });

  it('prepends as a new message when not found anywhere in the cache', () => {
    const m1 = makeMsg('existing');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    upsertIncomingMessage(qc, CHAT_ID, makeMsg('brand-new'));
    expect(getPages(qc)[0][0].id).toBe('brand-new');
  });

  it('preserves replyToMessage already on the cached entry when the incoming update omits it', () => {
    const m1 = makeMsg('with-reply', {
      replyToMessage: { id: 'orig', content: 'quoted', image_url: null, user_id: 'u2' },
    });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    // Simulates a postgres_changes UPDATE payload: raw columns only, no replyToMessage key.
    upsertIncomingMessage(qc, CHAT_ID, makeMsg('with-reply', { content: 'updated' }));
    expect(getPages(qc)[0][0].replyToMessage?.content).toBe('quoted');
  });
});

// ── applyIncomingMessageUpdate ────────────────────────────────────────────────

describe('applyIncomingMessageUpdate', () => {
  it('patches deletion flags into an existing cached message', () => {
    const m1 = makeMsg('del-live', { content: 'hello' });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'del-live',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const msg = getPages(qc)[0].find((m) => m.id === 'del-live');
    expect(msg?.deleted_by_sender).toBe(true);
    expect(msg?.deleted_by_receiver).toBe(true);
    // Untouched fields survive — this is a partial merge, not a replace.
    expect(msg?.content).toBe('hello');
  });

  it('finds and patches a message on a page other than the first', () => {
    const m1 = makeMsg('p0-msg');
    const m2 = makeMsg('p1-target');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, {
      pages: [[m1], [m2]],
      pageParams: [0, 1],
    });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'p1-target',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    expect(getPages(qc)[1][0].deleted_by_sender).toBe(true);
  });

  it('is a no-op when the message is not currently loaded — never fabricates a partial row', () => {
    const m1 = makeMsg('loaded');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'not-loaded-yet',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const pages = getPages(qc);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0].find((m) => m.id === 'not-loaded-yet')).toBeUndefined();
  });

  it('is a no-op when there is no cached data at all yet', () => {
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'whatever',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    expect(qc.getQueryData(QUERY_KEY)).toBeUndefined();
  });

  it('handles two independent deletions of different messages without interference (rapid succession)', () => {
    const m1 = makeMsg('rapid-1');
    const m2 = makeMsg('rapid-2');
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1, m2]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'rapid-1',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'rapid-2',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const pages = getPages(qc);
    expect(pages[0].find((m) => m.id === 'rapid-1')?.deleted_by_sender).toBe(true);
    expect(pages[0].find((m) => m.id === 'rapid-2')?.deleted_by_sender).toBe(true);
  });

  it('deletes an image message correctly — image_url is left in the cache (rendering hides it via the flags, not by clearing the field)', () => {
    const m1 = makeMsg('img-msg', { content: '', image_url: 'chat-images/photo.jpg' });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'img-msg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const msg = getPages(qc)[0].find((m) => m.id === 'img-msg');
    expect(msg?.deleted_by_sender).toBe(true);
    expect(msg?.image_url).toBe('chat-images/photo.jpg');
  });

  it('deletes a reply message correctly — replyToMessage is preserved (untouched by a partial deletion payload)', () => {
    const m1 = makeMsg('reply-msg', {
      reply_to_id: 'orig-id',
      replyToMessage: { id: 'orig-id', content: 'original text', image_url: null, user_id: 'u2' },
    });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[m1]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'reply-msg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const msg = getPages(qc)[0].find((m) => m.id === 'reply-msg');
    expect(msg?.deleted_by_sender).toBe(true);
    expect(msg?.reply_to_id).toBe('orig-id');
    expect(msg?.replyToMessage?.content).toBe('original text');
  });

  it('when the quoted original message is deleted for everyone, any reply to it is patched live', () => {
    const original = makeMsg('quoted-orig');
    const reply = makeMsg('quoting-reply', {
      reply_to_id: 'quoted-orig',
      replyToMessage: { id: 'quoted-orig', content: 'original text', image_url: null, user_id: 'user-1' },
    });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[original, reply]], pageParams: [0] });
    applyIncomingMessageUpdate(qc, CHAT_ID, {
      id: 'quoted-orig',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });
    const patchedReply = getPages(qc)[0].find((m) => m.id === 'quoting-reply');
    expect(patchedReply?.replyToMessage?.deleted_by_sender).toBe(true);
    expect(patchedReply?.replyToMessage?.deleted_by_receiver).toBe(true);
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

  it('"delete_for_everyone" also marks any reply quoting the deleted message as deleted', () => {
    const original = makeMsg('original-1');
    const reply = makeMsg('reply-1', {
      reply_to_id: 'original-1',
      replyToMessage: {
        id: 'original-1',
        content: 'Hello',
        image_url: null,
        user_id: 'user-1',
      },
    });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[original, reply]], pageParams: [0] });
    applyMessageDeletion({ queryClient: qc, chatId: CHAT_ID, messageId: 'original-1', action: 'delete_for_everyone', isSender: true });
    const patchedReply = getPages(qc)[0].find((m) => m.id === 'reply-1');
    expect(patchedReply?.replyToMessage?.deleted_by_sender).toBe(true);
    expect(patchedReply?.replyToMessage?.deleted_by_receiver).toBe(true);
  });

  it('"delete_for_me" does not affect any reply quoting the message', () => {
    const original = makeMsg('original-2');
    const reply = makeMsg('reply-2', {
      reply_to_id: 'original-2',
      replyToMessage: {
        id: 'original-2',
        content: 'Hello',
        image_url: null,
        user_id: 'user-1',
      },
    });
    qc.setQueryData<MessagesQueryData>(QUERY_KEY, { pages: [[original, reply]], pageParams: [0] });
    applyMessageDeletion({ queryClient: qc, chatId: CHAT_ID, messageId: 'original-2', action: 'delete_for_me', isSender: true });
    const patchedReply = getPages(qc)[0].find((m) => m.id === 'reply-2');
    expect(patchedReply?.replyToMessage?.deleted_by_sender).toBeFalsy();
  });
});
