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

describe('subscribeToChatMessages', () => {
  const chatId = 'chat-xyz';

  it('creates a channel with the correct name', () => {
    subscribeToChatMessages(chatId, jest.fn());
    expect(supabase.channel).toHaveBeenCalledWith(`chat-${chatId}`);
  });

  it('subscribes to postgres_changes INSERT on chat_messages with correct filter', () => {
    subscribeToChatMessages(chatId, jest.fn());
    const ch = getChannelMock();
    expect(ch.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'chat_messages',
        filter: `chat_id=eq.${chatId}`,
      }),
      expect.any(Function)
    );
  });

  it('calls the callback with the new message payload on INSERT', () => {
    const cb = jest.fn();
    subscribeToChatMessages(chatId, cb);
    const ch = getChannelMock();

    // Extract the callback passed to .on()
    const onCb = ch.on.mock.calls[0][2] as (payload: any) => void;
    const fakeMessage = { id: 'm1', chat_id: chatId, content: 'hello' };
    onCb({ new: fakeMessage });

    expect(cb).toHaveBeenCalledWith(fakeMessage);
  });

  it('returns a cleanup function that calls unsubscribe and removeChannel', () => {
    const cleanup = subscribeToChatMessages(chatId, jest.fn());
    const ch = getChannelMock();
    cleanup();
    expect(ch.unsubscribe).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(ch);
  });
});
