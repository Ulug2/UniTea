const { rejectionReason, selectPosts } = require('../../../scripts/capture/selectPosts');

function row(overrides: Record<string, unknown> = {}) {
  return {
    post_id: 'p-1',
    university_domain: 'nu.edu.kz',
    post_type: 'feed',
    is_anonymous: true,
    community_id: null,
    reposted_from_post_id: null,
    is_deleted: false,
    is_banned: false,
    is_author_blocked_by_viewer: false,
    image_url: null,
    image_urls: null,
    title: null,
    content: 'A perfectly normal anonymous campus post that fits the card.',
    vote_score: 10,
    comment_count: 2,
    created_at: '2026-09-20T10:00:00Z',
    ...overrides,
  };
}

const NOW = Date.parse('2026-10-01T00:00:00Z');
const NU = { domain: 'nu.edu.kz', usedEntries: [], now: NOW };

describe('capture post selection', () => {
  it('accepts an anonymous campus feed post from the last 14 days', () => {
    expect(rejectionReason(row(), NU)).toBeNull();
  });

  it.each([
    ['images', { image_urls: ['a.jpg'] }],
    ['very short text', { content: 'lol' }],
    ['long text (shows "read more")', { content: 'x'.repeat(400) }],
    ['many lines', { content: 'a\nb\nc\nd\ne' }],
    ['a long title', { title: 't'.repeat(120) }],
    ['a community post', { community_id: 'c-1' }],
    ['a repost', { reposted_from_post_id: 'p-0' }],
  ])('does not filter out %s — picks are purely the most-voted posts', (_label, overrides) => {
    expect(rejectionReason(row(overrides), NU)).toBeNull();
  });

  it.each([
    ['other campus', { university_domain: 'sdu.edu.kz' }],
    ['not a feed post', { post_type: 'lost_found' }],
    ['not anonymous', { is_anonymous: false }],
    ['removed', { is_banned: true }],
    ['blocked author', { is_author_blocked_by_viewer: true }],
    ['too old', { created_at: '2026-09-16T23:59:59Z' }],
    ['too old', { created_at: null }],
  ])('rejects: %s', (reason, overrides) => {
    expect(rejectionReason(row(overrides), NU)).toBe(reason);
  });

  it('skips posts already used, by id or by content prefix (whitespace/case-insensitive)', () => {
    const used = [
      { post_id: 'p-used' },
      { post_id: null, content_prefix: 'Читая тут посты  понимаю' },
    ];
    expect(rejectionReason(row({ post_id: 'p-used' }), { ...NU, usedEntries: used })).toBe('already used');
    expect(
      rejectionReason(
        row({ content: 'читая тут посты понимаю насколько скучная и невинная у меня жизнь' }),
        { ...NU, usedEntries: used },
      ),
    ).toBe('already used');
  });

  it('ranks by score, then comments, then newest, and caps at count', () => {
    const rows = [
      row({ post_id: 'low', vote_score: 1 }),
      row({ post_id: 'top', vote_score: 50 }),
      row({ post_id: 'tie-more-comments', vote_score: 20, comment_count: 9 }),
      row({ post_id: 'tie-newer', vote_score: 20, comment_count: 1, created_at: '2026-09-30T00:00:00Z' }),
      row({ post_id: 'tie-older', vote_score: 20, comment_count: 1, created_at: '2026-09-18T00:00:00Z' }),
      row({ post_id: 'popular-but-old', vote_score: 500, created_at: '2026-04-01T00:00:00Z' }),
      row({ post_id: 'sdu', vote_score: 99, university_domain: 'sdu.edu.kz' }),
    ];
    expect(selectPosts(rows, { campus: 'nu', count: 4, now: NOW }).map((r: { post_id: string }) => r.post_id)).toEqual([
      'top',
      'tie-more-comments',
      'tie-newer',
      'tie-older',
    ]);
    expect(selectPosts(rows, { campus: 'sdu', count: 5, now: NOW }).map((r: { post_id: string }) => r.post_id)).toEqual(['sdu']);
  });

  it('only takes posts from the last 14 days by default; maxAgeDays widens it', () => {
    const rows = [
      row({ post_id: 'fresh', created_at: '2026-09-17T00:00:01Z' }),
      row({ post_id: 'stale', created_at: '2026-09-16T00:00:00Z' }),
    ];
    const ids = (opts: object) =>
      selectPosts(rows, { campus: 'nu', count: 5, now: NOW, ...opts }).map((r: { post_id: string }) => r.post_id);
    expect(ids({})).toEqual(['fresh']);
    expect(ids({ maxAgeDays: 30 }).sort()).toEqual(['fresh', 'stale']);
  });

  it('rejects an unknown campus', () => {
    expect(() => selectPosts([], { campus: 'kbtu', count: 5 })).toThrow('Unknown campus');
  });
});
