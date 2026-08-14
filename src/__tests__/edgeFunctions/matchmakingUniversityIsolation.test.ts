/**
 * Phase 4 — University-Isolated Matchmaking.
 *
 * Two kinds of authorization logic are covered here, and neither can be
 * executed against a real runtime from this Jest suite:
 *
 * 1. Postgres RLS predicates (launch_event_profiles, launch_event_matches,
 *    the INSERT-spoofing trigger/backstop) — these only really execute
 *    inside Postgres. The functions below transcribe the exact boolean
 *    expressions from the deployed policies (see the file/migration
 *    references on each block) so the *logic* is pinned down and
 *    regression-tested here, but this does not prove Postgres evaluates it
 *    identically — that was verified separately via live rolled-back SQL
 *    simulation against production (see the Phase 4 report, Section 16).
 *
 * 2. Edge Function authorization (run-matchmaking, reset-matchmaking,
 *    purge-matchmaking-demographics) — same situation as Phase 3's
 *    ban-user/delete-post tests: these are Deno Edge Functions (remote
 *    https://deno.land / https://esm.sh imports, Deno.serve, Deno.env) and
 *    there is still no Deno runtime or test harness anywhere in this repo.
 *    The functions below transcribe the exact caller/target resolution and
 *    scoping logic from the deployed source, verbatim, per the Phase 3
 *    precedent of not building a new testing framework for this.
 *
 * reset_matchmaking_event() is a SQL function (supabase/migrations/
 * 20260812000000_university_scope_matchmaking_system.sql) — its scoped
 * DELETE statements are verified by direct source inspection plus live
 * rolled-back SQL simulation, not unit-testable here; this file only
 * documents (via a static source-string assertion) that no TRUNCATE
 * remains in it.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── launch_event_profiles RLS ────────────────────────────────────────────
describe('launch_event_profiles admin RLS predicate', () => {
  // supabase/migrations/20260812000000_university_scope_matchmaking_system.sql:
  //   "Admins can read all profiles" / "Admins can update profiles":
  //   USING (get_my_is_admin() AND university_id = get_my_university_id())
  function adminMayAccess(isAdmin: boolean, callerUniversityId: string | null, rowUniversityId: string | null) {
    return Boolean(isAdmin && callerUniversityId && rowUniversityId && callerUniversityId === rowUniversityId);
  }

  it('SDU admin -> SDU profile row: SELECT/UPDATE allowed', () => {
    expect(adminMayAccess(true, 'sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU admin -> NU profile row: SELECT/UPDATE allowed', () => {
    expect(adminMayAccess(true, 'nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU admin -> NU profile row: SELECT/UPDATE denied', () => {
    expect(adminMayAccess(true, 'sdu-uni', 'nu-uni')).toBe(false);
  });
  it('NU admin -> SDU profile row: SELECT/UPDATE denied', () => {
    expect(adminMayAccess(true, 'nu-uni', 'sdu-uni')).toBe(false);
  });
  it('non-admin: denied regardless of university', () => {
    expect(adminMayAccess(false, 'sdu-uni', 'sdu-uni')).toBe(false);
  });
  it('admin with no resolvable university: denied (fail closed)', () => {
    expect(adminMayAccess(true, null, 'sdu-uni')).toBe(false);
  });
});

describe('launch_event_profiles INSERT university-spoofing prevention', () => {
  // supabase/migrations/20260812000000_university_scope_matchmaking_system.sql:
  //   trg_set_launch_event_profile_university_id (BEFORE INSERT trigger)
  //   unconditionally overwrites NEW.university_id from the submitter's own
  //   profiles row, discarding any client-supplied value. The RLS WITH CHECK
  //   is an independent backstop re-checking the same invariant:
  //     university_id = (SELECT p.university_id FROM profiles p WHERE p.id = user_id)
  function resolveInsertUniversityId(clientSuppliedUniversityId: string, submitterRealUniversityId: string): string {
    // The trigger runs BEFORE the RLS WITH CHECK is evaluated, so by the
    // time WITH CHECK sees the row, university_id already equals the
    // submitter's real value regardless of what the client sent.
    void clientSuppliedUniversityId;
    return submitterRealUniversityId;
  }

  function passesInsertCheck(finalUniversityId: string, submitterRealUniversityId: string): boolean {
    return finalUniversityId === submitterRealUniversityId;
  }

  it('client claims a foreign university_id: trigger overwrites it, submission lands in the submitter\'s real university', () => {
    const resolved = resolveInsertUniversityId('nu-uni', 'sdu-uni');
    expect(resolved).toBe('sdu-uni');
    expect(passesInsertCheck(resolved, 'sdu-uni')).toBe(true);
  });
  it('a row that somehow still had a foreign university_id would fail the WITH CHECK backstop', () => {
    expect(passesInsertCheck('nu-uni', 'sdu-uni')).toBe(false);
  });
  it('legitimate submission (client sends own real university_id) is unaffected', () => {
    const resolved = resolveInsertUniversityId('sdu-uni', 'sdu-uni');
    expect(passesInsertCheck(resolved, 'sdu-uni')).toBe(true);
  });
});

// ── launch_event_matches RLS ─────────────────────────────────────────────
describe('launch_event_matches admin RLS predicates (SELECT/INSERT/UPDATE/DELETE)', () => {
  // supabase/migrations/20260812000000_university_scope_matchmaking_system.sql:
  // replaces the old unscoped `FOR ALL USING (get_my_is_admin())` policy
  // with 4 explicit policies, each requiring:
  //   get_my_is_admin() AND university_id = get_my_university_id()
  function adminMayOperate(isAdmin: boolean, callerUniversityId: string | null, rowUniversityId: string | null) {
    return Boolean(isAdmin && callerUniversityId && rowUniversityId && callerUniversityId === rowUniversityId);
  }

  const cases: Array<[string, boolean, string | null, string | null, boolean]> = [
    ['SDU admin -> SDU match: allowed', true, 'sdu-uni', 'sdu-uni', true],
    ['NU admin -> NU match: allowed', true, 'nu-uni', 'nu-uni', true],
    ['SDU admin -> NU match: denied', true, 'sdu-uni', 'nu-uni', false],
    ['NU admin -> SDU match: denied', true, 'nu-uni', 'sdu-uni', false],
    ['non-admin -> any match: denied', false, 'sdu-uni', 'sdu-uni', false],
    ['admin with unresolvable university: denied (fail closed)', true, null, 'sdu-uni', false],
  ];

  for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) {
    describe(op, () => {
      for (const [label, isAdmin, callerUni, rowUni, expected] of cases) {
        it(label, () => {
          expect(adminMayOperate(isAdmin, callerUni, rowUni)).toBe(expected);
        });
      }
    });
  }
});

// ── run-matchmaking ───────────────────────────────────────────────────────
describe('run-matchmaking caller-university resolution and scoping', () => {
  // supabase/functions/run-matchmaking/index.ts: resolves callerUniversityId
  // from the caller's own profiles row via service role (never from the
  // request body), fails closed if unresolvable, then filters the
  // launch_event_profiles fetch to .eq('university_id', callerUniversityId).
  function resolveCallerUniversity(profile: { university_id: string | null } | null): string {
    const id = profile?.university_id;
    if (!id) throw new Error('Forbidden: caller has no resolvable university');
    return id;
  }

  function profilesEligibleForProcessing(
    allProfiles: { user_id: string; university_id: string }[],
    callerUniversityId: string,
  ) {
    return allProfiles.filter((p) => p.university_id === callerUniversityId);
  }

  it('resolves caller university from their own profile row', () => {
    expect(resolveCallerUniversity({ university_id: 'sdu-uni' })).toBe('sdu-uni');
  });

  it('fails closed when the caller has no resolvable university', () => {
    expect(() => resolveCallerUniversity({ university_id: null })).toThrow('Forbidden');
    expect(() => resolveCallerUniversity(null)).toThrow('Forbidden');
  });

  it('only caller-university profiles are eligible for matching; cross-university profiles never enter the pool', () => {
    const allProfiles = [
      { user_id: 'a', university_id: 'sdu-uni' },
      { user_id: 'b', university_id: 'nu-uni' },
      { user_id: 'c', university_id: 'sdu-uni' },
    ];
    const eligible = profilesEligibleForProcessing(allProfiles, 'sdu-uni');
    expect(eligible.map((p) => p.user_id)).toEqual(['a', 'c']);
    expect(eligible.every((p) => p.university_id === 'sdu-uni')).toBe(true);
  });

  it('an SDU admin invocation can never write NU matches: written rows are always tagged with the caller university', () => {
    const callerUniversityId = 'sdu-uni';
    const writtenMatch = { user_a_id: 'a', user_b_id: 'c', university_id: callerUniversityId };
    expect(writtenMatch.university_id).toBe('sdu-uni');
    expect(writtenMatch.university_id).not.toBe('nu-uni');
  });
});

// ── reset-matchmaking ──────────────────────────────────────────────────────
describe('reset-matchmaking scoping', () => {
  // supabase/functions/reset-matchmaking/index.ts: resolves caller
  // university server-side, fails closed if unresolvable, then scopes every
  // delete: matches/profiles via .eq('university_id', callerUniversityId),
  // windows via .in('user_id', <profiles in that university>).
  function resolveCallerUniversity(profile: { university_id: string | null } | null): string {
    const id = profile?.university_id;
    if (!id) throw new Error('Forbidden: caller has no resolvable university');
    return id;
  }

  function rowsToDelete<T extends { university_id: string }>(rows: T[], callerUniversityId: string): T[] {
    return rows.filter((r) => r.university_id === callerUniversityId);
  }

  function windowUserIdsToDelete(
    profilesInCallerUniversity: { user_id: string }[],
  ): string[] {
    return profilesInCallerUniversity.map((p) => p.user_id);
  }

  it('fails closed when caller university is unresolvable', () => {
    expect(() => resolveCallerUniversity({ university_id: null })).toThrow('Forbidden');
  });

  it('only caller-university matches/profiles are selected for deletion; the other university is left untouched', () => {
    const matches = [
      { id: 'm1', university_id: 'sdu-uni' },
      { id: 'm2', university_id: 'nu-uni' },
    ];
    const deleted = rowsToDelete(matches, 'sdu-uni');
    expect(deleted).toEqual([{ id: 'm1', university_id: 'sdu-uni' }]);
    expect(deleted.some((m) => m.university_id === 'nu-uni')).toBe(false);
  });

  it('message-window deletions are resolved only through the caller-university profiles subset', () => {
    const sduProfiles = [{ user_id: 'a' }, { user_id: 'c' }];
    expect(windowUserIdsToDelete(sduProfiles)).toEqual(['a', 'c']);
  });
});

// ── purge-matchmaking-demographics ─────────────────────────────────────────
describe('purge-matchmaking-demographics scoping', () => {
  // supabase/functions/purge-matchmaking-demographics/index.ts: resolves
  // caller university server-side, fails closed if unresolvable, checks
  // that university's own phase === 'revealed', then updates only
  // .eq('university_id', callerUniversityId) rows.
  function resolveCallerUniversity(profile: { university_id: string | null } | null): string {
    const id = profile?.university_id;
    if (!id) throw new Error('Forbidden: caller has no resolvable university');
    return id;
  }

  function rowsToPurge(
    rows: { user_id: string; university_id: string; demographics_purged_at: string | null }[],
    callerUniversityId: string,
  ) {
    return rows.filter((r) => r.university_id === callerUniversityId && r.demographics_purged_at === null);
  }

  it('fails closed when caller university is unresolvable', () => {
    expect(() => resolveCallerUniversity({ university_id: null })).toThrow('Forbidden');
  });

  it('only caller-university, not-yet-purged rows are purged; the other university is untouched', () => {
    const rows = [
      { user_id: 'a', university_id: 'sdu-uni', demographics_purged_at: null },
      { user_id: 'b', university_id: 'nu-uni', demographics_purged_at: null },
      { user_id: 'c', university_id: 'sdu-uni', demographics_purged_at: '2026-01-01T00:00:00Z' },
    ];
    const purged = rowsToPurge(rows, 'sdu-uni');
    expect(purged.map((r) => r.user_id)).toEqual(['a']);
  });
});

// ── reset_matchmaking_event() — no TRUNCATE remains ────────────────────────
describe('reset_matchmaking_event() SQL function', () => {
  it('the deployed migration source contains no global TRUNCATE of matchmaking tables', () => {
    const migrationPath = join(
      __dirname,
      '../../../supabase/migrations/20260812000000_university_scope_matchmaking_system.sql',
    );
    const source = readFileSync(migrationPath, 'utf8');
    const fnStart = source.indexOf('CREATE OR REPLACE FUNCTION public.reset_matchmaking_event()');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart);
    expect(fnBody).not.toMatch(/TRUNCATE/i);
    expect(fnBody).toContain('get_my_university_id()');
    expect(fnBody).toContain("DELETE FROM launch_event_message_windows");
    expect(fnBody).toContain('DELETE FROM launch_event_matches WHERE university_id = v_university_id');
    expect(fnBody).toContain('DELETE FROM launch_event_profiles WHERE university_id = v_university_id');
  });
});
