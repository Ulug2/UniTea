-- ============================================================
-- Phase 10 — Final Security Closure: polls, reports, anon EXECUTE
-- ============================================================
-- Closes the two live, actionable findings from the Phase 9 audit that
-- Phase 7/8 missed. Legacy production data and the launch_event_message_
-- windows.match_id integrity gap are explicitly NOT touched here — see the
-- Phase 10 report (data requires human approval before any remediation;
-- match_id was investigated and found to have zero downstream consumers,
-- so a fix would be cosmetic only).

-- ── GROUP 1A — polls: scope SELECT to the owning post's university ──
-- Was `USING (true)` — the one table Phase 7's otherwise-matching set
-- (comments/votes/poll_options/poll_votes/post_stats) never actually
-- touched. Same pattern as poll_options: resolve university via the
-- poll's own post, not a university_id column (polls has none).
DROP POLICY IF EXISTS "Anyone can view polls" ON public.polls;
CREATE POLICY "Anyone can view polls"
  ON public.polls FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = polls.post_id
        AND p.university_id = public.get_my_university_id()
    )
  );

-- INSERT/UPDATE/DELETE on polls are already ownership-scoped via
-- posts.user_id = auth.uid() (Phase 9 confirmed these correctly implied
-- same-university already) — left untouched.


-- ── GROUP 1B — reports: scope INSERT to the reporter's own university ──
-- Was `WITH CHECK (reporter_id = auth.uid())` only — no check that the
-- reported post/comment/community belongs to the reporter's own
-- university. get_report_university_id(report_id) can't be reused
-- directly here: it looks the row up by id from the reports table, but at
-- INSERT time the row doesn't exist there yet (WITH CHECK evaluates
-- against the NEW row's own column values, not a re-query). A parallel
-- helper that resolves university from the raw target columns instead of
-- a report id closes that gap without touching the existing function
-- (still used, unchanged, by the SELECT/UPDATE admin policies).
CREATE OR REPLACE FUNCTION public.get_report_target_university_id(
  p_post_id uuid,
  p_comment_id uuid,
  p_community_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.university_id FROM public.posts p WHERE p.id = p_post_id),
    (SELECT p.university_id FROM public.posts p
       JOIN public.comments c ON c.post_id = p.id
      WHERE c.id = p_comment_id),
    (SELECT c.university_id FROM public.communities c WHERE c.id = p_community_id)
  );
$$;

-- Least-privilege from creation: only `authenticated` needs this (the
-- reports INSERT policy below calls it during a normal user's own insert;
-- nothing anonymous ever inserts a report).
REVOKE ALL ON FUNCTION public.get_report_target_university_id(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_target_university_id(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT
  WITH CHECK (
    reporter_id = auth.uid()
    AND get_report_target_university_id(post_id, comment_id, community_id) = public.get_my_university_id()
  );

-- Admin SELECT/UPDATE (Phase 2, get_report_university_id-based) and the
-- reporter's own "Allow read only for reporter" SELECT policy are
-- unchanged.


-- ── GROUP 1C — revoke anon EXECUTE on get_report_university_id ──
-- Missed by Phase 8's anon-EXECUTE cleanup (that pass covered a different,
-- separately-identified list of 8 functions). authenticated keeps EXECUTE
-- — the reports SELECT/UPDATE admin policies call this function internally
-- and would break for real admins without it.
REVOKE EXECUTE ON FUNCTION public.get_report_university_id(uuid) FROM anon;
