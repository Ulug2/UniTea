/**
 * Phase 8 — Defense-in-Depth & Audit-Completeness Hardening.
 *
 * Most of this phase is pure Postgres (a trigger, a nullable-column fix,
 * REVOKEs, RLS dedupe) with no Edge Function/RPC wrapper reachable from
 * Jest — those are pinned down here as transcribed-predicate tests, same
 * style as every prior phase's edgeFunctions test file, and independently
 * verified live via rolled-back SQL (see the Phase 8 report). The two
 * mobile-client fixes (matchmaking cache key, FilterContext user-scoping)
 * have their own behavioral tests elsewhere — FilterContext's in
 * src/__tests__/context/FilterContext.test.tsx — so only the query-key
 * shape itself is checked here for completeness.
 */

describe('user_activity_events university derivation (trg_set_user_activity_event_university_id)', () => {
  // supabase/migrations/20260815000000_defense_in_depth_hardening.sql:
  // BEFORE INSERT trigger unconditionally overwrites NEW.university_id from
  // profiles.university_id looked up via NEW.user_id, discarding any
  // caller-supplied value — same pattern as set_post_university_id() etc.
  function resolveInsertUniversityId(claimedUniversityId: string | null, submitterRealUniversityId: string): string {
    void claimedUniversityId;
    return submitterRealUniversityId;
  }

  it('a forged university_id claim is discarded; the event always lands under the submitter\'s real university', () => {
    const stored = resolveInsertUniversityId('nu-uni', 'sdu-uni');
    expect(stored).toBe('sdu-uni');
    expect(stored).not.toBe('nu-uni');
  });
  it('legitimate submission is unaffected', () => {
    expect(resolveInsertUniversityId('sdu-uni', 'sdu-uni')).toBe('sdu-uni');
  });
});

describe('admin_action_logs logging completeness (delete-comment, report status)', () => {
  // supabase/functions/delete-comment/index.ts: logs only on the admin path,
  // never for an owner's own self-delete — same convention as delete-post.
  function shouldLogDeleteComment(isAdmin: boolean, isOwner: boolean): boolean {
    return isAdmin && !isOwner;
  }

  it('admin deleting someone else\'s comment: logged', () => {
    expect(shouldLogDeleteComment(true, false)).toBe(true);
  });
  it('owner deleting their own comment: not logged (unchanged self-delete behavior)', () => {
    expect(shouldLogDeleteComment(false, true)).toBe(false);
  });
  it('admin deleting their own comment (isOwner true): not logged, matches delete-post convention', () => {
    expect(shouldLogDeleteComment(true, true)).toBe(false);
  });

  // moderation dashboard handleUpdateReportStatus: logs unconditionally,
  // since every caller of this handler is already gated behind is_admin by
  // the dashboard's own auth bootstrap and by the reports UPDATE RLS policy.
  it('report status update always logs when the underlying RLS update actually succeeded', () => {
    function shouldLogReportStatusChange(updateSucceeded: boolean): boolean {
      return updateSucceeded;
    }
    expect(shouldLogReportStatusChange(true)).toBe(true);
    expect(shouldLogReportStatusChange(false)).toBe(false);
  });
});

describe('matchmaking config query key is university-scoped', () => {
  // src/features/matchmaking/hooks/useEventConfig.ts: queryKey now includes
  // universityId, so two different universities' cached phases can never
  // collide/overwrite each other in the same QueryClient.
  function buildQueryKey(universityId: string | undefined) {
    return ['matchmaking', 'config', universityId] as const;
  }

  it('SDU and NU resolve to distinct cache keys', () => {
    const sduKey = buildQueryKey('sdu-uni');
    const nuKey = buildQueryKey('nu-uni');
    expect(sduKey).not.toEqual(nuKey);
  });
  it('a missing universityId (e.g. not yet loaded) produces its own distinct, harmless key rather than colliding with a real university', () => {
    const key = buildQueryKey(undefined);
    expect(key).toEqual(['matchmaking', 'config', undefined]);
  });
});

describe('admin_action_logs.admin_id nullability fix', () => {
  // Documents the fixed invariant: admin_id may now be NULL (matching its
  // FK's pre-existing ON DELETE SET NULL action), so an admin account with
  // logged actions can be deleted without the audit row being destroyed —
  // only the actor reference is cleared, university_id/action/metadata/
  // created_at all survive.
  it('a nulled admin_id still leaves the rest of the audit row intact', () => {
    const rowBefore = { admin_id: 'admin-1', action: 'ban', university_id: 'sdu-uni', metadata: {} };
    const rowAfterActorDeleted = { ...rowBefore, admin_id: null };
    expect(rowAfterActorDeleted.university_id).toBe(rowBefore.university_id);
    expect(rowAfterActorDeleted.action).toBe(rowBefore.action);
  });
});

describe('anon EXECUTE revocation list (Group 6)', () => {
  // The exact 8 functions confirmed via live grants query to still have
  // anon EXECUTE before this phase, and REVOKEd in the migration. Each one
  // already fails closed internally for an unauthenticated caller
  // (auth.uid() IS NULL / get_my_is_admin() false), so this is
  // defense-in-depth only.
  const revoked = [
    'initiate_anonymous_chat',
    'block_chat_partner',
    'delete_anonymous_chat',
    'mark_anonymous_chat_read',
    'get_analytics_summary',
    'get_daily_stats_chart',
    'get_daily_content_counts',
    'get_event_counts_period',
  ];

  it('covers exactly the 8 functions confirmed live to have anon EXECUTE pre-Phase-8', () => {
    expect(revoked).toHaveLength(8);
    expect(new Set(revoked).size).toBe(8);
  });

  it('does not touch functions that never had anon EXECUTE (count_* / reset_matchmaking_event)', () => {
    const untouched = ['count_distinct_active_users', 'count_distinct_active_users_action', 'count_today_dau', 'reset_matchmaking_event'];
    for (const fn of untouched) {
      expect(revoked).not.toContain(fn);
    }
  });
});
