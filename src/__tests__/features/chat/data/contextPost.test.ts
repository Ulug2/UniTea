/**
 * Tests for src/features/chat/data/contextPost.ts
 */

jest.mock('../../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import {
  getChatContextPostPreview,
  getContextPostRoute,
  parseContextPostId,
  type ChatContextPost,
} from '../../../../features/chat/data/contextPost';

const POST_ID = '11111111-2222-4333-8444-555555555555';

function post(overrides: Partial<ChatContextPost> = {}): ChatContextPost {
  return {
    post_id: POST_ID,
    title: 'Title',
    content: 'Body',
    post_type: 'feed',
    category: null,
    has_image: false,
    ...overrides,
  };
}

describe('parseContextPostId', () => {
  it('accepts a well-formed id', () => {
    expect(parseContextPostId(POST_ID)).toBe(POST_ID);
  });

  it.each([undefined, '', 'not-a-uuid', [POST_ID]])('drops %p', (value) => {
    expect(parseContextPostId(value as any)).toBeNull();
  });
});

describe('getChatContextPostPreview', () => {
  it('shows a feed post as title then content', () => {
    expect(getChatContextPostPreview(post(), false)).toEqual({ label: 'Post', text: 'Title\nBody' });
  });

  it('replaces images with an [image] placeholder', () => {
    expect(getChatContextPostPreview(post({ has_image: true }), false).text).toBe('Title\nBody\n[image]');
    expect(
      getChatContextPostPreview(post({ title: null, content: '', has_image: true }), false).text,
    ).toBe('[image]');
  });

  it('labels Lost & Found posts and prefixes their title with the category', () => {
    expect(
      getChatContextPostPreview(post({ post_type: 'lost_found', category: 'lost', title: 'Keys' }), false),
    ).toEqual({ label: 'Lost & Found', text: 'Lost: Keys\nBody' });
  });

  it('labels Market posts and shows the title as written', () => {
    expect(
      getChatContextPostPreview(post({ post_type: 'market', title: 'Bike' }), false),
    ).toEqual({ label: 'Market', text: 'Bike\nBody' });
  });

  it('says the post is unavailable when the reader cannot see it', () => {
    expect(getChatContextPostPreview(null, false).text).toBe('Post unavailable');
  });

  it('never claims a post is unavailable while it is loading or failed to load', () => {
    expect(getChatContextPostPreview(undefined, true).text).toBe('Loading…');
    expect(getChatContextPostPreview(undefined, false).text).toBe('Tap to open');
  });
});

describe('getContextPostRoute', () => {
  it('routes feed posts to the post screen and board posts to the Lost & Found / Market screen', () => {
    expect(getContextPostRoute(post())).toBe(`/post/${POST_ID}`);
    expect(getContextPostRoute(post({ post_type: 'lost_found' }))).toBe(`/lostfoundpost/${POST_ID}`);
    expect(getContextPostRoute(post({ post_type: 'market' }))).toBe(`/lostfoundpost/${POST_ID}`);
  });
});
