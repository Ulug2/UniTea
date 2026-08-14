/**
 * Regression test for Phase 1 (University-Isolated Admin System: Core RLS).
 *
 * post/[id].tsx's postDetailQueryOptions() intentionally fetches a post by
 * id with no client-side university_id filter — the security boundary is
 * enforced entirely by Postgres RLS ("Select posts in my university" on
 * public.posts, scoped in migration
 * 20260811010000_scope_admin_rls_to_own_university.sql). This is a
 * deliberate architecture decision, not an oversight: adding a client-side
 * `.eq("university_id", ...)` filter here would be "fixing" the wrong
 * layer (a determined client can always drop a filter; it cannot bypass
 * RLS) and was explicitly rejected during the Phase 1 security audit.
 *
 * This test exists so a future change can't silently reintroduce a
 * client-side filter here (which would just be redundant/misleading, since
 * the real guarantee lives in Postgres) or, worse, remove the reliance on
 * RLS without anyone noticing the boundary moved.
 *
 * The actual cross-university enforcement itself is NOT — and cannot be —
 * verified by this Jest suite, since the mocked Supabase client has no RLS
 * engine. That verification was performed live against production via
 * read-only, rolled-back SQL simulations (SET LOCAL role authenticated +
 * forged request.jwt.claims for both real admin accounts), confirming:
 *   - SDU admin reading an NU post by known UUID -> 0 rows (denied)
 *   - NU admin reading an SDU post by known UUID -> 0 rows (denied)
 *   - each admin retains full read/update/delete authorization within
 *     their own university
 * See the Phase 1 implementation report for the full verification matrix.
 */
jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../../lib/supabase';
import { postDetailQueryOptions } from '../../../features/posts/data/postDetailQuery';

const mockFrom = supabase.from as jest.Mock;

function buildChain() {
  const chain: Record<string, any> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
  return chain;
}

describe('postDetailQuery university isolation (RLS is the boundary, not the client)', () => {
  it('filters only by post_id — never adds a client-side university_id filter', async () => {
    const chain = buildChain();
    mockFrom.mockReturnValue(chain);

    await postDetailQueryOptions('post-123').queryFn();

    expect(mockFrom).toHaveBeenCalledWith('posts_summary_view');
    expect(chain.eq).toHaveBeenCalledWith('post_id', 'post-123');
    expect(chain.eq).not.toHaveBeenCalledWith(
      'university_id',
      expect.anything(),
    );
  });
});
