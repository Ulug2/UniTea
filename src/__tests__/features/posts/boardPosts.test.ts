/**
 * Tests for src/features/posts/utils/boardPosts.ts
 */
import {
  boardPostsKey,
  formatPrice,
  getBoardPostTitle,
  isBoardPostType,
  parsePrice,
  sanitizePriceInput,
} from '../../../features/posts/utils/boardPosts';

describe('isBoardPostType', () => {
  it('accepts market and lost_found only', () => {
    expect(isBoardPostType('market')).toBe(true);
    expect(isBoardPostType('lost_found')).toBe(true);
    expect(isBoardPostType('feed')).toBe(false);
    expect(isBoardPostType(undefined)).toBe(false);
  });
});

describe('boardPostsKey', () => {
  it('keeps the Lost & Found key the persisted cache already uses', () => {
    expect(boardPostsKey('lost_found', 'uni-1')).toEqual(['posts', 'lost_found', 'uni-1']);
  });

  it('gives each segment its own cache entry, and a prefix for invalidation', () => {
    expect(boardPostsKey('market', 'uni-1')).toEqual(['posts', 'market', 'uni-1']);
    expect(boardPostsKey('market')).toEqual(['posts', 'market']);
  });
});

describe('getBoardPostTitle', () => {
  it('prefixes Lost & Found titles with their category', () => {
    expect(getBoardPostTitle({ post_type: 'lost_found', category: 'lost', title: 'Keys' })).toBe('Lost: Keys');
    expect(getBoardPostTitle({ post_type: 'lost_found', category: 'found', title: 'Keys' })).toBe('Found: Keys');
    expect(getBoardPostTitle({ post_type: 'lost_found', category: 'lost', title: null })).toBe('Lost');
  });

  it('shows market titles as written', () => {
    expect(getBoardPostTitle({ post_type: 'market', category: null, title: ' Desk lamp ' })).toBe('Desk lamp');
  });
});

describe('formatPrice', () => {
  it('groups thousands and appends the tenge sign', () => {
    expect(formatPrice(500)).toBe('500 ₸');
    expect(formatPrice(12000)).toBe('12 000 ₸');
    expect(formatPrice(1250000)).toBe('1 250 000 ₸');
  });

  it('shows 0 as Free and no price as nothing', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(undefined)).toBeNull();
    expect(formatPrice(-5)).toBeNull();
  });
});

describe('price input', () => {
  it('strips everything but digits and leading zeros', () => {
    expect(sanitizePriceInput('12 000 ₸')).toBe('12000');
    expect(sanitizePriceInput('0050')).toBe('50');
    expect(sanitizePriceInput('0')).toBe('0');
  });

  it('parses to a whole number, or null when empty or out of range', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('12000')).toBe(12000);
    expect(parsePrice('0')).toBe(0);
    expect(parsePrice('9999999999')).toBeNull();
  });
});
