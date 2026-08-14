/**
 * Phase 3 — University-Isolated Admin System: Edge Function Authorization.
 *
 * ban-user, unban-user, delete-post, and delete-comment are Deno Edge
 * Functions (remote https://deno.land / https://esm.sh imports, Deno.serve,
 * Deno.env) — there is no Deno runtime or test harness anywhere in this
 * repository (confirmed: no deno.json test config, no *.test.ts under
 * supabase/functions, `deno` is not installed), and this phase intentionally
 * does not introduce one (that would be a large new testing framework built
 * solely for this phase, which the spec explicitly asks not to do).
 *
 * These functions use service-role access throughout, so — unlike the
 * RLS-backed tables from Phases 1/2 — there is no database policy to
 * simulate against either; the only authorization boundary is the
 * university-comparison predicate each function now runs in application
 * code before its privileged mutation. This test therefore documents and
 * verifies that exact predicate, transcribed verbatim from the deployed
 * source (see the file:line references on each block below) rather than a
 * live execution of the Deno runtime. It proves the *logic* is correct for
 * every required case; it does not prove the deployed function actually
 * runs it — that was confirmed instead by direct code review of each file
 * as part of this phase's implementation (see the Phase 3 report).
 */

describe('ban-user / unban-user university isolation predicate', () => {
  // supabase/functions/ban-user/index.ts and unban-user/index.ts:
  //   if (!profile.university_id || !targetProfile.university_id ||
  //       profile.university_id !== targetProfile.university_id) { deny }
  function isAuthorized(callerUniversityId: string | null, targetUniversityId: string | null) {
    return Boolean(
      callerUniversityId &&
        targetUniversityId &&
        callerUniversityId === targetUniversityId,
    );
  }

  it('SDU admin -> SDU user: ALLOWED', () => {
    expect(isAuthorized('sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU admin -> NU user: ALLOWED', () => {
    expect(isAuthorized('nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU admin -> NU user: DENIED', () => {
    expect(isAuthorized('sdu-uni', 'nu-uni')).toBe(false);
  });
  it('NU admin -> SDU user: DENIED', () => {
    expect(isAuthorized('nu-uni', 'sdu-uni')).toBe(false);
  });
  it('caller with no resolvable university: DENIED (fail closed)', () => {
    expect(isAuthorized(null, 'sdu-uni')).toBe(false);
  });
  it('target with no resolvable university: DENIED (fail closed)', () => {
    expect(isAuthorized('sdu-uni', null)).toBe(false);
  });
});

describe('delete-post university isolation predicate (admin path only, not owner path)', () => {
  // supabase/functions/delete-post/index.ts:
  //   if (!isOwner && isAdmin) {
  //     if (!profile.university_id || !post.university_id ||
  //         profile.university_id !== post.university_id) { deny }
  //   }
  function adminMayDelete(
    isOwner: boolean,
    isAdmin: boolean,
    callerUniversityId: string | null,
    postUniversityId: string | null,
  ) {
    if (isOwner) return true; // owner path is untouched by this phase
    if (!isAdmin) return false;
    return Boolean(
      callerUniversityId &&
        postUniversityId &&
        callerUniversityId === postUniversityId,
    );
  }

  it('SDU admin -> SDU post: ALLOWED', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU admin -> NU post: ALLOWED', () => {
    expect(adminMayDelete(false, true, 'nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU admin -> NU post: DENIED', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', 'nu-uni')).toBe(false);
  });
  it('NU admin -> SDU post: DENIED', () => {
    expect(adminMayDelete(false, true, 'nu-uni', 'sdu-uni')).toBe(false);
  });
  it('non-admin, non-owner: DENIED regardless of university', () => {
    expect(adminMayDelete(false, false, 'sdu-uni', 'sdu-uni')).toBe(false);
  });
  it('owner deleting their own post: ALLOWED regardless of admin/university (unchanged behavior)', () => {
    expect(adminMayDelete(true, false, 'sdu-uni', 'nu-uni')).toBe(true);
  });
  it('post with unresolvable university: DENIED (fail closed)', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', null)).toBe(false);
  });
});

describe('delete-comment university isolation predicate (resolved via comment.post_id -> posts.university_id)', () => {
  // supabase/functions/delete-comment/index.ts:
  //   if (!isOwner && isAdmin) {
  //     const parentPost = ... .eq("id", comment.post_id) ...
  //     if (!profile.university_id || !parentPost?.university_id ||
  //         profile.university_id !== parentPost.university_id) { deny }
  //   }
  function adminMayDelete(
    isOwner: boolean,
    isAdmin: boolean,
    callerUniversityId: string | null,
    parentPostUniversityId: string | null | undefined,
  ) {
    if (isOwner) return true;
    if (!isAdmin) return false;
    return Boolean(
      callerUniversityId &&
        parentPostUniversityId &&
        callerUniversityId === parentPostUniversityId,
    );
  }

  it('SDU admin -> comment on SDU post: ALLOWED', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', 'sdu-uni')).toBe(true);
  });
  it('NU admin -> comment on NU post: ALLOWED', () => {
    expect(adminMayDelete(false, true, 'nu-uni', 'nu-uni')).toBe(true);
  });
  it('SDU admin -> comment on NU post: DENIED', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', 'nu-uni')).toBe(false);
  });
  it('NU admin -> comment on SDU post: DENIED', () => {
    expect(adminMayDelete(false, true, 'nu-uni', 'sdu-uni')).toBe(false);
  });
  it('parent post unresolvable (e.g. lookup failed): DENIED (fail closed)', () => {
    expect(adminMayDelete(false, true, 'sdu-uni', undefined)).toBe(false);
  });
  it('comment owner deleting their own comment: ALLOWED regardless of admin/university (unchanged behavior)', () => {
    expect(adminMayDelete(true, false, 'sdu-uni', 'nu-uni')).toBe(true);
  });
});
