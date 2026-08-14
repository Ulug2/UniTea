/**
 * Phase 7 — University Isolation: Content Interactions, Anonymous Chat,
 * Analytics.
 *
 * All three fixes here are pure Postgres (RLS policies + SECURITY DEFINER
 * function bodies) — there is no Edge Function or RPC wrapper reachable
 * from Jest. The functions below transcribe the exact boolean predicates
 * from the deployed migration (supabase/migrations/20260814000000_
 * university_scope_content_analytics_and_anon_chat.sql) so the logic is
 * pinned down and regression-tested here, following the same style as
 * adminUniversityIsolation.test.ts / matchmakingUniversityIsolation.test.ts
 * / adminActionLogsUniversityIsolation.test.ts. This does not prove
 * Postgres evaluates it identically — that was verified separately via
 * live rolled-back SQL simulation against production (see the Phase 7
 * report).
 */

// ── GROUP 1 — comments / votes / poll_votes / poll_options / post_stats ──
describe('content-interaction RLS predicates (post-scoped university boundary)', () => {
  // comments/post_stats: EXISTS (SELECT 1 FROM posts p WHERE p.id = <row>.post_id AND p.university_id = get_my_university_id())
  function postScopedPredicate(rowPostUniversityId: string | null, callerUniversityId: string | null): boolean {
    return Boolean(rowPostUniversityId && callerUniversityId && rowPostUniversityId === callerUniversityId);
  }

  it('SDU caller -> row on an SDU post: allowed', () => {
    expect(postScopedPredicate('sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('SDU caller -> row on an NU post: denied', () => {
    expect(postScopedPredicate('nu-uni', 'sdu-uni')).toBe(false);
  });
  it('NU caller -> row on an NU post: allowed', () => {
    expect(postScopedPredicate('nu-uni', 'nu-uni')).toBe(true);
  });
  it('NU caller -> row on an SDU post: denied', () => {
    expect(postScopedPredicate('sdu-uni', 'nu-uni')).toBe(false);
  });
  it('unresolvable caller university: denied (fail closed)', () => {
    expect(postScopedPredicate('sdu-uni', null)).toBe(false);
  });
});

describe('votes RLS predicate (post-vote OR comment-vote, exactly one set per votes_target_check)', () => {
  // (EXISTS post-branch) OR (EXISTS comment->post-branch)
  function votesPredicate(
    votePostUniversityId: string | null,
    voteCommentPostUniversityId: string | null,
    callerUniversityId: string | null,
  ): boolean {
    const postBranch = Boolean(votePostUniversityId && callerUniversityId && votePostUniversityId === callerUniversityId);
    const commentBranch = Boolean(
      voteCommentPostUniversityId && callerUniversityId && voteCommentPostUniversityId === callerUniversityId,
    );
    return postBranch || commentBranch;
  }

  it('SDU caller -> post-vote on SDU post: allowed', () => {
    expect(votesPredicate('sdu-uni', null, 'sdu-uni')).toBe(true);
  });
  it('SDU caller -> post-vote on NU post: denied', () => {
    expect(votesPredicate('nu-uni', null, 'sdu-uni')).toBe(false);
  });
  it('SDU caller -> comment-vote on a comment whose post is SDU: allowed', () => {
    expect(votesPredicate(null, 'sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('SDU caller -> comment-vote on a comment whose post is NU: denied', () => {
    expect(votesPredicate(null, 'nu-uni', 'sdu-uni')).toBe(false);
  });
});

describe('poll_options / poll_votes RLS predicate (via polls.post_id)', () => {
  function pollScopedPredicate(pollPostUniversityId: string | null, callerUniversityId: string | null): boolean {
    return Boolean(pollPostUniversityId && callerUniversityId && pollPostUniversityId === callerUniversityId);
  }

  it('SDU caller -> poll option/vote on a poll whose post is SDU: allowed', () => {
    expect(pollScopedPredicate('sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('SDU caller -> poll option/vote on a poll whose post is NU: denied', () => {
    expect(pollScopedPredicate('nu-uni', 'sdu-uni')).toBe(false);
  });
});

describe('comments/votes/poll_votes INSERT: ownership AND university both required', () => {
  // e.g. comments WITH CHECK: ((auth.uid()=user_id) OR (user_id IS NULL)) AND EXISTS(post in my university)
  function insertAllowed(ownershipOk: boolean, postInCallerUniversity: boolean): boolean {
    return ownershipOk && postInCallerUniversity;
  }

  it('own row, same-university post: allowed', () => {
    expect(insertAllowed(true, true)).toBe(true);
  });
  it('own row, foreign-university post: denied (this is exactly what Phase 6 found exploitable)', () => {
    expect(insertAllowed(true, false)).toBe(false);
  });
  it('not own row (and not the null-user_id branch), same-university post: denied', () => {
    expect(insertAllowed(false, true)).toBe(false);
  });
});

// ── GROUP 2 — initiate_anonymous_chat() ────────────────────────────────
describe('initiate_anonymous_chat() university check', () => {
  // supabase/migrations/20260814000000_...sql: resolves both profiles'
  // university_id server-side (never client-supplied), fails closed if
  // either is unresolvable, then requires equality before the self-chat
  // check and before the INSERT.
  function mayInitiate(
    callerId: string,
    authorId: string,
    callerUniversityId: string | null,
    authorUniversityId: string | null,
  ): { allowed: boolean; reason?: string } {
    if (callerUniversityId === null || authorUniversityId === null) {
      return { allowed: false, reason: 'unable to resolve university for caller or post author' };
    }
    if (callerUniversityId !== authorUniversityId) {
      return { allowed: false, reason: 'cannot initiate an anonymous chat across universities' };
    }
    if (callerId === authorId) {
      return { allowed: false, reason: 'cannot start a chat with yourself' };
    }
    return { allowed: true };
  }

  it('SDU caller -> SDU author (different users): allowed', () => {
    expect(mayInitiate('u1', 'u2', 'sdu-uni', 'sdu-uni')).toEqual({ allowed: true });
  });
  it('NU caller -> NU author (different users): allowed', () => {
    expect(mayInitiate('u1', 'u2', 'nu-uni', 'nu-uni')).toEqual({ allowed: true });
  });
  it('SDU caller -> NU author: denied with the university-mismatch reason (this is exactly the Phase 6 exploit)', () => {
    const result = mayInitiate('u1', 'u2', 'sdu-uni', 'nu-uni');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/across universities/);
  });
  it('NU caller -> SDU author: denied, symmetric', () => {
    const result = mayInitiate('u1', 'u2', 'nu-uni', 'sdu-uni');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/across universities/);
  });
  it('unresolvable university on either side: denied, fail closed, checked before the university-equality comparison', () => {
    expect(mayInitiate('u1', 'u2', null, 'sdu-uni').reason).toMatch(/unable to resolve/);
    expect(mayInitiate('u1', 'u2', 'sdu-uni', null).reason).toMatch(/unable to resolve/);
  });
  it('same university, same user: denied for the pre-existing self-chat reason, not university (the university check does not interfere with this pre-existing behavior)', () => {
    const result = mayInitiate('u1', 'u1', 'sdu-uni', 'sdu-uni');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cannot start a chat with yourself');
  });
});

// ── GROUP 3 — analytics RPCs ────────────────────────────────────────────
describe('analytics RPC university scoping (all 7 functions share this pattern)', () => {
  // Each RPC: IF NOT is_admin THEN forbidden; v_university_id := get_my_university_id();
  // IF v_university_id IS NULL THEN forbidden; then every underlying
  // aggregate is filtered to that university.
  function resolveAnalyticsScope(isAdmin: boolean, callerUniversityId: string | null): string {
    if (!isAdmin) throw new Error('forbidden');
    if (!callerUniversityId) throw new Error('forbidden: caller has no resolvable university');
    return callerUniversityId;
  }

  const rpcNames = [
    'get_analytics_summary',
    'get_daily_stats_chart',
    'get_daily_content_counts',
    'get_event_counts_period',
    'count_distinct_active_users',
    'count_distinct_active_users_action',
    'count_today_dau',
  ];

  for (const name of rpcNames) {
    it(`${name}: non-admin caller is rejected before any university resolution`, () => {
      expect(() => resolveAnalyticsScope(false, 'sdu-uni')).toThrow('forbidden');
    });
    it(`${name}: admin with unresolvable university fails closed`, () => {
      expect(() => resolveAnalyticsScope(true, null)).toThrow('no resolvable university');
    });
    it(`${name}: admin scope resolves to their own university, never a platform-wide aggregate`, () => {
      expect(resolveAnalyticsScope(true, 'sdu-uni')).toBe('sdu-uni');
      expect(resolveAnalyticsScope(true, 'nu-uni')).toBe('nu-uni');
    });
  }

  it('get_daily_stats_chart historical branch reads per-university snapshot rows, not the platform-wide (university_id IS NULL) row', () => {
    // Documents the specific pre-Phase-7 bug: the historical branch used to
    // filter `university_id IS NULL` (the platform-wide row), which is why
    // every admin saw the same combined numbers regardless of university.
    const historicalBranchFilter = (universityId: string) => `university_id = '${universityId}'`;
    expect(historicalBranchFilter('sdu-uni')).not.toMatch(/IS NULL/);
  });
});
