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
import { resolveOtherParticipant } from '../../../../features/chat/utils/getChatIdentity';

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
