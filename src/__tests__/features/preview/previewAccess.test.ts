import { isPreviewablePost, isUuid } from '../../../features/preview/utils/previewAccess';
import { isProfileBanned } from '../../../utils/banStatus';
import { getPreviewFixture } from '../../../features/preview/data/fixtures';
import type { PostsSummaryViewRow } from '../../../types/posts';

const VIEWER_UNI = '00000000-0000-4000-8000-0000000000b1';
const post = getPreviewFixture('text') as PostsSummaryViewRow;

describe('isUuid', () => {
  it.each([
    ['00000000-0000-4000-8000-000000000001', true],
    ['A1B2C3D4-E5F6-4789-8ABC-DEF012345678', true],
    ['not-a-uuid', false],
    ['00000000-0000-4000-8000-00000000000', false],
    ["1' or '1'='1", false],
    ['', false],
    [undefined, false],
    [['00000000-0000-4000-8000-000000000001'], false],
  ])('%p → %p', (value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});

describe('isPreviewablePost', () => {
  it('allows a regular feed post from the viewer’s own university', () => {
    expect(isPreviewablePost(post, VIEWER_UNI)).toBe(true);
  });

  it.each<[string, Partial<PostsSummaryViewRow>]>([
    ['another university', { university_id: 'other-university' }],
    ['a lost & found post', { post_type: 'lost_found' }],
    ['a deleted post', { is_deleted: true }],
    ['a banned author', { is_banned: true }],
    ['an author the viewer blocked', { is_author_blocked_by_viewer: true }],
    ['a repost of a blocked author', { is_original_author_blocked_by_viewer: true }],
  ])('rejects %s', (_label, override) => {
    expect(isPreviewablePost({ ...post, ...override }, VIEWER_UNI)).toBe(false);
  });

  it('rejects when the post or the viewer’s university is missing', () => {
    expect(isPreviewablePost(null, VIEWER_UNI)).toBe(false);
    expect(isPreviewablePost(post, null)).toBe(false);
    expect(isPreviewablePost(post, undefined)).toBe(false);
  });
});

describe('isProfileBanned', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it.each([
    [null, false],
    [{ is_permanently_banned: false, banned_until: null }, false],
    [{ is_permanently_banned: true, banned_until: null }, true],
    [{ is_permanently_banned: false, banned_until: '2026-10-02T00:00:00Z' }, true],
    [{ is_permanently_banned: false, banned_until: '2026-09-30T00:00:00Z' }, false],
  ])('%p → %p', (profile, expected) => {
    expect(isProfileBanned(profile, now)).toBe(expected);
  });
});

describe('preview fixtures', () => {
  it('are clearly sample content with reserved ids, and anonymous ones carry no identity', () => {
    for (const name of ['text', 'anonymous', 'anonymous-sdu', 'long']) {
      const row = getPreviewFixture(name)!;
      expect(row.post_id.startsWith('00000000-0000-4000-8000-')).toBe(true);
      expect(row.content).toMatch(/sample|fixture/i);
    }
    const anon = getPreviewFixture('anonymous')!;
    expect(anon.is_anonymous).toBe(true);
    expect(anon.user_id).toBeNull();
    expect(anon.username).toBeNull();
    expect(getPreviewFixture('unknown')).toBeNull();
    expect(getPreviewFixture(undefined)).toBeNull();
  });
});

describe('Cyrillic font fallback', () => {
  const { buildCyrillicFallbackCss } = require('../../../features/preview/utils/cyrillicFontFallback');

  it('adds a sans-serif face for every Poppins family, limited to Cyrillic ranges', () => {
    const css: string = buildCyrillicFallbackCss();
    for (const family of ['Poppins_400Regular', 'Poppins_500Medium', 'Poppins_600SemiBold', 'Poppins_700Bold']) {
      expect(css).toContain(`font-family:"${family}"`);
    }
    expect(css.match(/unicode-range:U\+0400-052F/g)).toHaveLength(4);
    expect(css).toContain('local("Helvetica Neue")');
    expect(css).not.toMatch(/serif"\)/);
  });
});
