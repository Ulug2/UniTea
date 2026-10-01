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

const NU = { domain: 'nu.edu.kz', usedEntries: [] };

describe('capture post selection', () => {
  it('accepts an anonymous, text-only campus feed post that fits the card', () => {
    expect(rejectionReason(row(), NU)).toBeNull();
  });

  it.each([
    ['other campus', { university_domain: 'sdu.edu.kz' }],
    ['not a feed post', { post_type: 'lost_found' }],
    ['not anonymous', { is_anonymous: false }],
    ['community post', { community_id: 'c-1' }],
    ['repost', { reposted_from_post_id: 'p-0' }],
    ['removed', { is_banned: true }],
    ['blocked author', { is_author_blocked_by_viewer: true }],
    ['has images', { image_urls: ['a.jpg'] }],
    ['too short', { content: 'lol' }],
    ['too long for the card', { content: 'x'.repeat(181) }],
    ['too many lines', { content: 'line one is here\nline two\nline three\nline four' }],
    ['title too long', { title: 't'.repeat(81) }],
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
      row({ post_id: 'tie-older', vote_score: 20, comment_count: 1, created_at: '2026-09-01T00:00:00Z' }),
      row({ post_id: 'sdu', vote_score: 99, university_domain: 'sdu.edu.kz' }),
    ];
    expect(selectPosts(rows, { campus: 'nu', count: 4 }).map((r: { post_id: string }) => r.post_id)).toEqual([
      'top',
      'tie-more-comments',
      'tie-newer',
      'tie-older',
    ]);
    expect(selectPosts(rows, { campus: 'sdu', count: 5 }).map((r: { post_id: string }) => r.post_id)).toEqual(['sdu']);
  });

  it('rejects an unknown campus', () => {
    expect(() => selectPosts([], { campus: 'kbtu', count: 5 })).toThrow('Unknown campus');
  });
});
