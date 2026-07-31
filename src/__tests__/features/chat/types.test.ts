/**
 * Tests for the pure helper functions in src/features/chat/types.ts —
 * tombstone/deletion visibility rules and block-filtering for the message list.
 */
import {
  isDeletedForViewer,
  isDeletedForEveryone,
  deletedLabel,
  selectMessages,
  type ChatMessageVM,
  type MessagesQueryData,
} from '../../../features/chat/types';
import type { BlockRecord } from '../../../hooks/useBlocks';

function makeMessage(overrides: Partial<ChatMessageVM> = {}): ChatMessageVM {
  return {
    id: 'm1',
    chat_id: 'c1',
    user_id: 'sender',
    content: 'hi',
    created_at: new Date().toISOString(),
    is_read: false,
    deleted_by_receiver: null,
    deleted_by_sender: null,
    ...overrides,
  } as ChatMessageVM;
}

describe('isDeletedForViewer', () => {
  it('is true for the sender only when deleted_by_sender is true', () => {
    const msg = makeMessage({ user_id: 'sender', deleted_by_sender: true });
    expect(isDeletedForViewer(msg, 'sender')).toBe(true);
    expect(isDeletedForViewer(msg, 'receiver')).toBe(false);
  });

  it('is true for the receiver only when deleted_by_receiver is true', () => {
    const msg = makeMessage({ user_id: 'sender', deleted_by_receiver: true });
    expect(isDeletedForViewer(msg, 'receiver')).toBe(true);
    expect(isDeletedForViewer(msg, 'sender')).toBe(false);
  });

  it('is false for both sides when neither delete flag is set', () => {
    const msg = makeMessage();
    expect(isDeletedForViewer(msg, 'sender')).toBe(false);
    expect(isDeletedForViewer(msg, 'receiver')).toBe(false);
  });
});

describe('isDeletedForEveryone', () => {
  it('is true only when both sender and receiver flags are true', () => {
    expect(
      isDeletedForEveryone(
        makeMessage({ deleted_by_sender: true, deleted_by_receiver: true }),
      ),
    ).toBe(true);
  });

  it('is false when only one side has deleted it', () => {
    expect(isDeletedForEveryone(makeMessage({ deleted_by_sender: true }))).toBe(false);
    expect(isDeletedForEveryone(makeMessage({ deleted_by_receiver: true }))).toBe(false);
    expect(isDeletedForEveryone(makeMessage())).toBe(false);
  });
});

describe('deletedLabel', () => {
  it('returns the standard tombstone copy regardless of message content', () => {
    expect(deletedLabel(makeMessage({ content: 'secret stuff' }))).toBe(
      'This message was deleted',
    );
  });
});

describe('selectMessages', () => {
  const messagesData: MessagesQueryData = {
    pages: [
      [makeMessage({ id: 'm1', user_id: 'user-a' }), makeMessage({ id: 'm2', user_id: 'user-b' })],
      [makeMessage({ id: 'm3', user_id: 'user-a' })],
    ],
    pageParams: [0, 1],
  };

  it('returns an empty array when there is no data', () => {
    expect(selectMessages(undefined, [], false)).toEqual([]);
  });

  it('flattens all pages when there are no blocks', () => {
    const result = selectMessages(messagesData, [], false);
    expect(result.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  describe('non-anonymous chat', () => {
    it('filters out messages from profile_only-blocked users', () => {
      const blocks: BlockRecord[] = [{ userId: 'user-a', scope: 'profile_only' }];
      const result = selectMessages(messagesData, blocks, false);
      expect(result.map((m) => m.id)).toEqual(['m2']);
    });

    it('does not filter messages from anonymous_only-blocked users (wrong scope for this chat)', () => {
      const blocks: BlockRecord[] = [{ userId: 'user-a', scope: 'anonymous_only' }];
      const result = selectMessages(messagesData, blocks, false);
      expect(result.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });
  });

  describe('anonymous chat', () => {
    it('filters out messages from anonymous_only-blocked users', () => {
      const blocks: BlockRecord[] = [{ userId: 'user-a', scope: 'anonymous_only' }];
      const result = selectMessages(messagesData, blocks, true);
      expect(result.map((m) => m.id)).toEqual(['m2']);
    });

    it('does not filter messages from profile_only-blocked users (wrong scope for this chat)', () => {
      const blocks: BlockRecord[] = [{ userId: 'user-a', scope: 'profile_only' }];
      const result = selectMessages(messagesData, blocks, true);
      expect(result.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });
  });
});
