/**
 * Tests for src/features/chat/utils/getChatIdentity.ts
 *
 * resolveOtherParticipant was extracted after a real bug was caught in a
 * final audit: the chat list screen's inline version of this logic called
 * `otherUserId.startsWith("anonymous-")` with no null guard. Once
 * user_chats_summary redacts the counterpart's participant column for
 * anonymous chats (Phase 4), otherUserId is `null` there, and that line
 * threw a TypeError on every anonymous chat list render. These tests
 * pin the fixed behavior so it can't regress silently.
 */
import {
  resolveOtherParticipant,
  getChatDisplayIdentity,
} from '../../../../features/chat/utils/getChatIdentity';

describe('resolveOtherParticipant', () => {
  const currentUserId = 'user-a';

  it('non-anonymous chat, current user is participant_1: resolves participant_2 as other', () => {
    const result = resolveOtherParticipant(
      { participant_1_id: currentUserId, participant_2_id: 'user-b', is_anonymous: false },
      currentUserId,
    );
    expect(result).toEqual({ otherUserId: 'user-b', isAnonymous: false });
  });

  it('non-anonymous chat, current user is participant_2: resolves participant_1 as other', () => {
    const result = resolveOtherParticipant(
      { participant_1_id: 'user-b', participant_2_id: currentUserId, is_anonymous: false },
      currentUserId,
    );
    expect(result).toEqual({ otherUserId: 'user-b', isAnonymous: false });
  });

  it('anonymous chat with the counterpart column NULL (real user_chats_summary/chats_view shape) does not throw and reports isAnonymous', () => {
    expect(() =>
      resolveOtherParticipant(
        { participant_1_id: currentUserId, participant_2_id: null, is_anonymous: true },
        currentUserId,
      ),
    ).not.toThrow();

    const result = resolveOtherParticipant(
      { participant_1_id: currentUserId, participant_2_id: null, is_anonymous: true },
      currentUserId,
    );
    expect(result).toEqual({ otherUserId: null, isAnonymous: true });
  });

  it('anonymous chat where the viewer is participant_2 and participant_1 is redacted', () => {
    const result = resolveOtherParticipant(
      { participant_1_id: null, participant_2_id: currentUserId, is_anonymous: true },
      currentUserId,
    );
    expect(result).toEqual({ otherUserId: null, isAnonymous: true });
  });

  it('legacy fake-id convention (is_anonymous missing/false, id starts with "anonymous-") is still detected', () => {
    const result = resolveOtherParticipant(
      { participant_1_id: currentUserId, participant_2_id: 'anonymous-xyz', is_anonymous: false },
      currentUserId,
    );
    expect(result).toEqual({ otherUserId: null, isAnonymous: true });
  });

  it('never calls .startsWith on a null id even when is_anonymous is missing entirely', () => {
    expect(() =>
      resolveOtherParticipant(
        { participant_1_id: currentUserId, participant_2_id: null },
        currentUserId,
      ),
    ).not.toThrow();
  });
});

/**
 * Privacy regression coverage for the initiator_id redaction fix
 * (20260803000000_redact_anonymous_chat_initiator_id.sql).
 *
 * Root cause being guarded against: chats_view/user_chats_summary used to
 * expose the real initiator_id to BOTH participants of an anonymous chat,
 * even though participant_1_id/participant_2_id were already redacted for
 * the counterpart. The fix makes the server null initiator_id for whichever
 * participant did not start the chat -- these tests prove the client's
 * display logic already handles that shape correctly (never assumes,
 * requires, or falls back to the real value for the non-initiator) and
 * that non-anonymous chats are completely unaffected.
 */
describe('getChatDisplayIdentity', () => {
  const initiatorId = 'user-initiator-real-uuid';
  const nonInitiatorId = 'user-author-real-uuid';

  it('anonymous chat, viewer IS the initiator: shows "Them", using their own unredacted initiator_id', () => {
    const identity = getChatDisplayIdentity(
      { id: 'chat-1', is_anonymous: true, initiator_id: initiatorId, created_at: '2026-01-01' },
      initiatorId,
      null,
    );
    expect(identity).toEqual({ displayName: 'Them', isAnonymousChat: true });
  });

  it('anonymous chat, viewer is NOT the initiator and initiator_id is redacted (null): never throws, never surfaces the real id', () => {
    const identity = getChatDisplayIdentity(
      { id: 'chat-1', is_anonymous: true, initiator_id: null, created_at: '2026-01-01' },
      nonInitiatorId,
      null,
    );
    expect(identity.isAnonymousChat).toBe(true);
    expect(identity.displayName).toMatch(/^Anonymous User #\d+$/);
    // The real UUID must never leak into the displayed name, even as a substring.
    expect(identity.displayName).not.toContain(initiatorId);
    expect(identity.displayName).not.toContain(nonInitiatorId);
  });

  it('the alias shown to the non-initiator is stable for the same chat and does not depend on initiator_id being present', () => {
    const chat = { id: 'chat-1', is_anonymous: true, initiator_id: null, created_at: '2026-01-01' };
    const first = getChatDisplayIdentity(chat, nonInitiatorId, null);
    const second = getChatDisplayIdentity(chat, nonInitiatorId, null);
    expect(first.displayName).toBe(second.displayName);
  });

  it('two different anonymous chats produce different aliases for the same non-initiating viewer (no cross-chat linkage)', () => {
    const chatA = { id: 'chat-a', is_anonymous: true, initiator_id: null, created_at: '2026-01-01' };
    const chatB = { id: 'chat-b', is_anonymous: true, initiator_id: null, created_at: '2026-01-01' };
    const identityA = getChatDisplayIdentity(chatA, nonInitiatorId, null);
    const identityB = getChatDisplayIdentity(chatB, nonInitiatorId, null);
    expect(identityA.displayName).not.toBe(identityB.displayName);
  });

  it('non-anonymous chat: real username is shown regardless of initiator_id, redacted or not', () => {
    const withRealInitiator = getChatDisplayIdentity(
      { id: 'chat-2', is_anonymous: false, initiator_id: initiatorId },
      nonInitiatorId,
      { username: 'realuser', avatar_url: null },
    );
    const withNullInitiator = getChatDisplayIdentity(
      { id: 'chat-2', is_anonymous: false, initiator_id: null },
      nonInitiatorId,
      { username: 'realuser', avatar_url: null },
    );
    expect(withRealInitiator).toEqual({ displayName: 'realuser', isAnonymousChat: false });
    expect(withNullInitiator).toEqual({ displayName: 'realuser', isAnonymousChat: false });
  });

  it('both participants of the same anonymous chat get correct, non-symmetric identities from their own perspective', () => {
    // Server contract after the fix: initiator sees their own real
    // initiator_id; the counterpart sees it as null. Same chat, two calls,
    // simulating each side's own query result.
    const chatAsSeenByInitiator = { id: 'chat-3', is_anonymous: true, initiator_id: initiatorId, created_at: '2026-01-01' };
    const chatAsSeenByCounterpart = { id: 'chat-3', is_anonymous: true, initiator_id: null, created_at: '2026-01-01' };

    const initiatorView = getChatDisplayIdentity(chatAsSeenByInitiator, initiatorId, null);
    const counterpartView = getChatDisplayIdentity(chatAsSeenByCounterpart, nonInitiatorId, null);

    expect(initiatorView.displayName).toBe('Them');
    expect(counterpartView.displayName).toMatch(/^Anonymous User #\d+$/);
  });
});
