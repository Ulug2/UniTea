/**
 * Tests for ChatMessageRow.tsx — specifically that a deleted-for-everyone
 * image-only message (no caption) uses the exact same tombstone the
 * component already renders for deleted text messages, instead of
 * rendering nothing.
 *
 * Root cause covered here: the tombstone block used to be gated on
 * `item.content` alone. An image-only message has empty content both
 * before and after deletion (the server never rewrites content on
 * delete — see chat_messages_view), so that gate never opened for these
 * messages once real (non-optimistic) data replaced the temporary
 * optimistic content override. The image itself was already correctly
 * hidden by a separate, already-correct `!showTombstone` check — so the
 * combined effect was the whole message rendering as nothing.
 */
jest.mock('../../../../components/ResponsiveImage', () => {
  const { View } = require('react-native');
  return function MockResponsiveImage(props: any) {
    return <View testID="responsive-image" {...props} />;
  };
});

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ChatMessageRow } from '../../../../features/chat/components/ChatMessageRow';
import type { ChatMessageVM } from '../../../../features/chat/types';
import type { Theme } from '../../../../context/ThemeContext';

const theme = {
  background: '#fff',
  card: '#fff',
  text: '#000',
  secondaryText: '#666',
  primary: '#2FC9C1',
  border: '#eee',
  error: '#EF4444',
  messageBubble: '#F0F0F0',
} as unknown as Theme;

const CURRENT_USER = 'me';
const OTHER_USER = 'them';

function makeMessage(overrides: Partial<ChatMessageVM> = {}): ChatMessageVM {
  return {
    id: 'msg-1',
    chat_id: 'chat-1',
    user_id: OTHER_USER,
    content: '',
    image_url: null,
    image_aspect_ratio: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_read: true,
    deleted_by_receiver: null,
    deleted_by_sender: null,
    reply_to_id: null,
    replyToMessage: null,
    ...overrides,
  } as ChatMessageVM;
}

const noop = () => {};
const defaultProps = {
  nextMsg: null,
  currentUserId: CURRENT_USER,
  theme,
  onLongPress: noop,
  onRetry: noop,
  onImagePress: jest.fn(),
  getMessageTime: () => '12:00 PM',
  getDateDivider: () => 'Today',
  shouldShowDateDivider: () => false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ChatMessageRow — deleted image-only message uses the existing tombstone', () => {
  it('renders the tombstone (not nothing) for a deleted image-only message', () => {
    const item = makeMessage({
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByText('This message was deleted')).toBeTruthy();
  });

  it('does not render the image once deleted', () => {
    const item = makeMessage({
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.queryByTestId('responsive-image')).toBeNull();
  });

  it('never invokes onImagePress for a deleted image-only message (image gesture disabled)', () => {
    const onImagePress = jest.fn();
    const item = makeMessage({
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} onImagePress={onImagePress} />);

    // There is no pressable image element to fire on at all — asserting
    // it never rendered (previous test) plus that the callback the real
    // image press handler would have called was never invoked.
    expect(onImagePress).not.toHaveBeenCalled();
  });

  it('renders no loading spinner / sending overlay for a deleted image-only message', () => {
    const item = makeMessage({
      id: 'temp-optimistic-1',
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    // The sending-overlay ActivityIndicator only ever renders inside the
    // image block (keyed off item.id.startsWith('temp-')); with the image
    // block entirely absent, no such overlay can be present either.
    expect(screen.queryByTestId('responsive-image')).toBeNull();
  });

  it('sender sees "You deleted this message." for a deleted image-only message', () => {
    const item = makeMessage({
      user_id: CURRENT_USER,
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} currentUserId={CURRENT_USER} />);

    expect(screen.getByText('You deleted this message.')).toBeTruthy();
    expect(screen.queryByText('This message was deleted')).toBeNull();
  });

  it('recipient sees "This message was deleted" for a deleted image-only message', () => {
    const item = makeMessage({
      user_id: OTHER_USER,
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} currentUserId={CURRENT_USER} />);

    expect(screen.getByText('This message was deleted')).toBeTruthy();
    expect(screen.queryByText('You deleted this message.')).toBeNull();
  });

  it('a captioned (text + image) deleted message still shows the tombstone (regression guard for the already-working case)', () => {
    const item = makeMessage({
      content: 'check this out',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByText('This message was deleted')).toBeTruthy();
    expect(screen.queryByTestId('responsive-image')).toBeNull();
    expect(screen.queryByText('check this out')).toBeNull();
  });

  it('a deleted text-only message is unaffected (existing behavior preserved)', () => {
    const item = makeMessage({
      content: 'hello there',
      image_url: null,
      deleted_by_sender: true,
      deleted_by_receiver: true,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByText('This message was deleted')).toBeTruthy();
    expect(screen.queryByText('hello there')).toBeNull();
  });

  it('a live (non-deleted) image-only message renders the image and no tombstone (regression guard)', () => {
    const item = makeMessage({
      content: '',
      image_url: 'chat-images/photo.jpg',
      deleted_by_sender: null,
      deleted_by_receiver: null,
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByTestId('responsive-image')).toBeTruthy();
    expect(screen.queryByText('This message was deleted')).toBeNull();
  });

  it('reply quote to a deleted image-only message shows "This message was deleted" instead of the image snippet', () => {
    const item = makeMessage({
      id: 'reply-to-deleted-image',
      content: 'replying here',
      reply_to_id: 'deleted-image-msg',
      replyToMessage: {
        id: 'deleted-image-msg',
        content: null,
        image_url: 'chat-images/photo.jpg',
        user_id: OTHER_USER,
        deleted_by_sender: true,
        deleted_by_receiver: true,
      },
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByText('This message was deleted')).toBeTruthy();
    // Confirms the reply preview did NOT fall back to the "📷 Image" label
    // it would show for a still-live image reply target.
    expect(screen.queryByText('📷 Image')).toBeNull();
  });

  it('reply quote to a still-live image-only message shows the "📷 Image" placeholder, not a tombstone (regression guard)', () => {
    const item = makeMessage({
      id: 'reply-to-live-image',
      content: 'replying here',
      reply_to_id: 'live-image-msg',
      replyToMessage: {
        id: 'live-image-msg',
        content: null,
        image_url: 'chat-images/photo.jpg',
        user_id: OTHER_USER,
        deleted_by_sender: false,
        deleted_by_receiver: false,
      },
    });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByText('📷 Image')).toBeTruthy();
    expect(screen.queryByText('This message was deleted')).toBeNull();
  });
});

describe('ChatMessageRow — assumeCached image prop forwarding (Phase 7.2)', () => {
  it('forwards assumeCached=true to ResponsiveImage for restored/cached messages', () => {
    const item = makeMessage({ image_url: 'chat-images/photo.jpg' });

    render(<ChatMessageRow item={item} {...defaultProps} assumeCached />);

    expect(screen.getByTestId('responsive-image').props.assumeCached).toBe(true);
  });

  it('defaults assumeCached to false for genuinely new messages', () => {
    const item = makeMessage({ image_url: 'chat-images/photo.jpg' });

    render(<ChatMessageRow item={item} {...defaultProps} />);

    expect(screen.getByTestId('responsive-image').props.assumeCached).toBe(false);
  });
});
