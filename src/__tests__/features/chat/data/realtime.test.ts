/**
 * Tests for src/features/chat/data/realtime.ts
 */

jest.mock('../../../../lib/supabase', () => {
  const channelMock = {
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  channelMock.on.mockReturnValue(channelMock);
  channelMock.subscribe.mockReturnValue(channelMock);
  return {
    supabase: {
      channel: jest.fn().mockReturnValue(channelMock),
      removeChannel: jest.fn(),
    },
  };
});

import { supabase } from '../../../../lib/supabase';
import { subscribeToChatMessages } from '../../../../features/chat/data/realtime';

const mockChannel = (supabase.channel as jest.Mock).mock.results[0]?.value as {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
};

function getChannelMock() {
  return (supabase.channel as jest.Mock).mock.results[
    (supabase.channel as jest.Mock).mock.results.length - 1
  ]?.value as { on: jest.Mock; subscribe: jest.Mock; unsubscribe: jest.Mock };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-set up the chain after clearAllMocks
  const ch = {
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  ch.on.mockReturnValue(ch);
  ch.subscribe.mockReturnValue(ch);
  (supabase.channel as jest.Mock).mockReturnValue(ch);
});

describe('subscribeToChatMessages (non-anonymous, postgres_changes)', () => {
  const chatId = 'chat-xyz';
  const userId = 'user-a';

  it('creates a channel with the correct name', () => {
    subscribeToChatMessages(chatId, userId, false, { onRawInsert: jest.fn() });
    expect(supabase.channel).toHaveBeenCalledWith(`chat-${chatId}`);
  });

  it('subscribes to postgres_changes with event "*" (not just INSERT) so UPDATE deliveries are not filtered out', () => {
    subscribeToChatMessages(chatId, userId, false, { onRawInsert: jest.fn() });
    const ch = getChannelMock();
    expect(ch.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        table: 'chat_messages',
        filter: `chat_id=eq.${chatId}`,
      }),
      expect.any(Function)
    );
  });

  it('calls onRawInsert with the new message payload on an INSERT event', () => {
    const cb = jest.fn();
    subscribeToChatMessages(chatId, userId, false, { onRawInsert: cb });
    const ch = getChannelMock();

    // Extract the callback passed to .on()
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    const fakeMessage = { id: 'm1', chat_id: chatId, content: 'hello' };
    onCb({ eventType: 'INSERT', new: fakeMessage });

    expect(cb).toHaveBeenCalledWith(fakeMessage);
  });

  it('calls onMessageUpdate (not onRawInsert) with the new row on an UPDATE event — e.g. deletion', () => {
    const onRawInsert = jest.fn();
    const onMessageUpdate = jest.fn();
    subscribeToChatMessages(chatId, userId, false, { onRawInsert, onMessageUpdate });
    const ch = getChannelMock();
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    const updatedRow = {
      id: 'm1',
      chat_id: chatId,
      content: 'hello',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    };
    onCb({ eventType: 'UPDATE', new: updatedRow });

    expect(onMessageUpdate).toHaveBeenCalledWith(updatedRow);
    expect(onRawInsert).not.toHaveBeenCalled();
  });

  it('ignores a DELETE event (whole-chat hard deletes are handled elsewhere)', () => {
    const onRawInsert = jest.fn();
    const onMessageUpdate = jest.fn();
    subscribeToChatMessages(chatId, userId, false, { onRawInsert, onMessageUpdate });
    const ch = getChannelMock();
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    onCb({ eventType: 'DELETE', old: { id: 'm1' } });

    expect(onRawInsert).not.toHaveBeenCalled();
    expect(onMessageUpdate).not.toHaveBeenCalled();
  });

  it('returns a cleanup function that calls unsubscribe and removeChannel', () => {
    const cleanup = subscribeToChatMessages(chatId, userId, false, {
      onRawInsert: jest.fn(),
    });
    const ch = getChannelMock();
    cleanup();
    expect(ch.unsubscribe).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
  });
});

describe('subscribeToChatMessages (anonymous, Broadcast)', () => {
  const chatId = 'chat-xyz';
  const userId = 'user-a';

  it('creates a private channel named after the chat and the current user only', () => {
    subscribeToChatMessages(chatId, userId, true, { onRawInsert: jest.fn() });
    expect(supabase.channel).toHaveBeenCalledWith(
      `anon-chat-message:${chatId}:${userId}`,
      { config: { private: true } }
    );
  });

  it('subscribes to the "new_message" broadcast event, not postgres_changes', () => {
    subscribeToChatMessages(chatId, userId, true, { onRawInsert: jest.fn() });
    const ch = getChannelMock();
    expect(ch.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'new_message' },
      expect.any(Function)
    );
  });

  it('calls onRawInsert with the broadcast payload for this chat', () => {
    const cb = jest.fn();
    subscribeToChatMessages(chatId, userId, true, { onRawInsert: cb });
    const ch = getChannelMock();
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    const fakeMessage = { id: 'm1', chat_id: chatId, content: 'hello, no user_id here' };
    onCb({ payload: fakeMessage });
    expect(cb).toHaveBeenCalledWith(fakeMessage);
  });

  it('ignores a broadcast payload for a different chat_id', () => {
    const cb = jest.fn();
    subscribeToChatMessages(chatId, userId, true, { onRawInsert: cb });
    const ch = getChannelMock();
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    onCb({ payload: { id: 'm2', chat_id: 'some-other-chat', content: 'x' } });
    expect(cb).not.toHaveBeenCalled();
  });

  it('also subscribes to the "message_deleted" broadcast event on the same channel', () => {
    subscribeToChatMessages(chatId, userId, true, { onRawInsert: jest.fn() });
    const ch = getChannelMock();
    expect(ch.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'message_deleted' },
      expect.any(Function)
    );
    // Same channel/topic as new_message — not a second subscribe() call.
    expect(supabase.channel).toHaveBeenCalledTimes(1);
  });

  it('calls onMessageUpdate with the deletion payload', () => {
    const onMessageUpdate = jest.fn();
    subscribeToChatMessages(chatId, userId, true, {
      onRawInsert: jest.fn(),
      onMessageUpdate,
    });
    const ch = getChannelMock();
    const deletedCall = ch.on.mock.calls.find(
      (call) => call[0] === 'broadcast' && call[1]?.event === 'message_deleted'
    );
    const onCb = deletedCall?.[2] as (payload: any) => void;
    const deletion = { id: 'm1', deleted_by_sender: true, deleted_by_receiver: true };
    onCb({ payload: deletion });
    expect(onMessageUpdate).toHaveBeenCalledWith(deletion);
  });

  it('ignores a message_deleted payload with no id', () => {
    const onMessageUpdate = jest.fn();
    subscribeToChatMessages(chatId, userId, true, {
      onRawInsert: jest.fn(),
      onMessageUpdate,
    });
    const ch = getChannelMock();
    const deletedCall = ch.on.mock.calls.find(
      (call) => call[0] === 'broadcast' && call[1]?.event === 'message_deleted'
    );
    const onCb = deletedCall?.[2] as (payload: any) => void;
    onCb({ payload: { deleted_by_sender: true } });
    expect(onMessageUpdate).not.toHaveBeenCalled();
  });

  it('returns a cleanup function that calls unsubscribe and removeChannel', () => {
    const cleanup = subscribeToChatMessages(chatId, userId, true, {
      onRawInsert: jest.fn(),
    });
    const ch = getChannelMock();
    cleanup();
    expect(ch.unsubscribe).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
  });
});
