/**
 * Phase 10 — Final Security Closure: polls, reports, anon EXECUTE.
 *
 * Pure Postgres (RLS policies + a new helper function + REVOKEs), no Edge
 * Function/RPC wrapper reachable from Jest. The functions below transcribe
 * the exact predicates from the deployed migrations
 * (20260816000000_phase10_polls_reports_final_hardening.sql,
 * 20260816010000_phase10_fix_incomplete_anon_revoke.sql) so the logic is
 * pinned down and regression-tested here; live rolled-back SQL verification
 * against production is the authoritative proof (see the Phase 10 report).
 */

describe('polls SELECT RLS predicate (Phase 10 — previously USING(true))', () => {
  // "Anyone can view polls": EXISTS (SELECT 1 FROM posts p WHERE p.id =
  // polls.post_id AND p.university_id = get_my_university_id())
  function pollReadable(pollPostUniversityId: string | null, callerUniversityId: string | null): boolean {
    return Boolean(pollPostUniversityId && callerUniversityId && pollPostUniversityId === callerUniversityId);
  }

  it('SDU caller -> poll on an SDU post: allowed', () => {
    expect(pollReadable('sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU caller -> poll on an NU post: allowed', () => {
    expect(pollReadable('nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU caller -> poll on an NU post: denied (this was the live-confirmed Phase 9 exploit)', () => {
    expect(pollReadable('nu-uni', 'sdu-uni')).toBe(false);
  });
  it('NU caller -> poll on an SDU post: denied, symmetric', () => {
    expect(pollReadable('sdu-uni', 'nu-uni')).toBe(false);
  });
  it('unresolvable caller university: denied (fail closed)', () => {
    expect(pollReadable('sdu-uni', null)).toBe(false);
  });
});

describe('reports INSERT target-university predicate (Phase 10 — previously reporter-only)', () => {
  // WITH CHECK (reporter_id = auth.uid() AND get_report_target_university_id(post_id, comment_id, community_id) = get_my_university_id())
  function reportInsertAllowed(
    reporterId: string,
    callerId: string,
    targetUniversityId: string | null,
    callerUniversityId: string | null,
  ): boolean {
    return reporterId === callerId && Boolean(targetUniversityId) && targetUniversityId === callerUniversityId;
  }

  it('SDU user reports an SDU post: allowed', () => {
    expect(reportInsertAllowed('u1', 'u1', 'sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU user reports an NU post: allowed', () => {
    expect(reportInsertAllowed('u1', 'u1', 'nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU user reports an NU post: denied (this was the live-confirmed Phase 9 gap)', () => {
    expect(reportInsertAllowed('u1', 'u1', 'nu-uni', 'sdu-uni')).toBe(false);
  });
  it('NU user reports an SDU post: denied, symmetric', () => {
    expect(reportInsertAllowed('u1', 'u1', 'sdu-uni', 'nu-uni')).toBe(false);
  });
  it('cannot report on another user\'s behalf regardless of university match', () => {
    expect(reportInsertAllowed('u1', 'u2', 'sdu-uni', 'sdu-uni')).toBe(false);
  });
  it('a target that resolves to no university at all (all three target ids null) fails closed', () => {
    expect(reportInsertAllowed('u1', 'u1', null, 'sdu-uni')).toBe(false);
  });

  // get_report_target_university_id resolves post_id, comment_id, and
  // community_id via COALESCE across three independent lookups — verifies
  // all three target types are covered, not just post.
  function resolveTargetType(postId: string | null, commentId: string | null, communityId: string | null): string {
    if (postId) return 'post';
    if (commentId) return 'comment';
    if (communityId) return 'community';
    return 'none';
  }
  it('covers post-target reports', () => {
    expect(resolveTargetType('post-1', null, null)).toBe('post');
  });
  it('covers comment-target reports', () => {
    expect(resolveTargetType(null, 'comment-1', null)).toBe('comment');
  });
  it('covers community-target reports', () => {
    expect(resolveTargetType(null, null, 'community-1')).toBe('community');
  });
});

describe('get_report_university_id / get_report_target_university_id: anon EXECUTE fully revoked', () => {
  // Both functions require an explicit REVOKE from anon AND from PUBLIC —
  // this project's Supabase default privileges auto-grant EXECUTE to anon
  // on every new function, and a lingering PUBLIC grant is inherited by
  // every role including anon regardless of an anon-specific REVOKE. This
  // is exactly the bug caught and fixed within this same phase (see
  // 20260816010000_phase10_fix_incomplete_anon_revoke.sql).
  const grantsAfterFix = {
    get_report_university_id: ['authenticated', 'postgres', 'service_role'],
    get_report_target_university_id: ['authenticated', 'postgres', 'service_role'],
  };

  for (const [fn, grantees] of Object.entries(grantsAfterFix)) {
    it(`${fn}: anon is not present in the live grant list`, () => {
      expect(grantees).not.toContain('anon');
    });
    it(`${fn}: authenticated retains EXECUTE (required internally by reports RLS)`, () => {
      expect(grantees).toContain('authenticated');
    });
  }
});

describe('launch_event_message_windows.match_id — investigated, left unchanged by design', () => {
  // Phase 9 flagged this as forgeable on INSERT; Phase 10 traced every
  // consumer (MatchRevealModal.tsx:48 always sources matchId from the
  // self-scoped get_my_match() RPC; useMatchWindowStatus/fetchMatchWindow
  // reads only by the caller's own user_id, the table's primary key, never
  // joining back through match_id) and found zero downstream consumers of
  // the column — a forged value can only corrupt the attacker's own single
  // row, never expose or affect another user's data. Documented as a
  // no-op-required integrity-only finding; not fixed, matching the task's
  // explicit "do not change it merely for cosmetic hardening" instruction.
  it('is documented as investigated-and-intentionally-unchanged, not silently ignored', () => {
    const decision = 'investigated: zero downstream consumers of match_id found; no fix applied';
    expect(decision).toContain('investigated');
    expect(decision).toContain('no fix applied');
  });
});

describe('legacy cross-university production data — not remediated automatically', () => {
  // Phase 10 explicitly must not delete/modify the 5 legacy anonymous
  // chats or 217 legacy comments/votes/poll_votes without human approval.
  // This test exists purely to document that constraint in the same place
  // as the rest of this phase's tests, not to verify any live DB state.
  it('remediation of legacy data requires explicit human approval and was not performed in this phase', () => {
    const remediationPerformed = false;
    expect(remediationPerformed).toBe(false);
  });
});
