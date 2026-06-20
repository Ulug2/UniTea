/**
 * Tests every row of the banner state machine from the spec:
 *
 * phase        | submitted | expired | expected
 * -------------|-----------|---------|----------
 * inactive     | —         | —       | hidden
 * accepting    | no        | —       | "Join"
 * accepting    | yes       | —       | hidden
 * locked       | —         | —       | hidden
 * revealed     | no        | —       | hidden
 * revealed     | yes       | no      | "See match"
 * revealed     | yes       | yes     | hidden
 */

type Phase = 'inactive' | 'accepting' | 'locked' | 'revealed' | undefined;

// Pure extraction of the visibility logic from MatchmakingBanner so it can be
// tested without React or Supabase.
function getBannerState(
  phase: Phase,
  hasSubmission: boolean,
  isExpired: boolean,
): 'hidden' | 'join' | 'reveal' {
  if (!phase || phase === 'inactive' || phase === 'locked') return 'hidden';
  if (phase === 'accepting' && hasSubmission) return 'hidden';
  if (phase === 'revealed' && !hasSubmission) return 'hidden';
  if (phase === 'revealed' && isExpired) return 'hidden';

  if (phase === 'accepting') return 'join';
  if (phase === 'revealed') return 'reveal';
  return 'hidden';
}

describe('MatchmakingBanner visibility', () => {
  it('is hidden when phase is undefined (tables not deployed yet)', () => {
    expect(getBannerState(undefined, false, false)).toBe('hidden');
  });

  it('is hidden when phase is inactive', () => {
    expect(getBannerState('inactive', false, false)).toBe('hidden');
    expect(getBannerState('inactive', true, false)).toBe('hidden');
  });

  it('is hidden when phase is locked (submissions closed, results pending)', () => {
    expect(getBannerState('locked', false, false)).toBe('hidden');
    expect(getBannerState('locked', true, false)).toBe('hidden');
  });

  it('shows "Join" when accepting and user has NOT submitted', () => {
    expect(getBannerState('accepting', false, false)).toBe('join');
  });

  it('is hidden when accepting and user HAS already submitted', () => {
    expect(getBannerState('accepting', true, false)).toBe('hidden');
  });

  it('is hidden when revealed and user did NOT participate', () => {
    expect(getBannerState('revealed', false, false)).toBe('hidden');
    expect(getBannerState('revealed', false, true)).toBe('hidden');
  });

  it('shows "See match" when revealed, user submitted, and window is still open', () => {
    expect(getBannerState('revealed', true, false)).toBe('reveal');
  });

  it('is hidden when revealed, user submitted, but 24h window has expired', () => {
    expect(getBannerState('revealed', true, true)).toBe('hidden');
  });
});
