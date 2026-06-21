-- ============================================================
-- Enforce auth-only access at the database level.
--
-- UniTee requires authentication to use. Unauthenticated users
-- should not be able to read any application data, not even via
-- the GraphQL API. This migration revokes SELECT from the `anon`
-- role on every remaining content table and view, clearing the
-- pg_graphql_anon_table_exposed (lint 0026) warnings.
--
-- The `authenticated` role retains SELECT on all of these;
-- row-level security policies restrict what each user actually
-- sees (own records, university-scoped content, etc.).
-- ============================================================

-- Content tables
REVOKE SELECT ON TABLE public.posts              FROM anon;
REVOKE SELECT ON TABLE public.post_stats         FROM anon;
REVOKE SELECT ON TABLE public.comments           FROM anon;
REVOKE SELECT ON TABLE public.profiles           FROM anon;
REVOKE SELECT ON TABLE public.communities        FROM anon;
REVOKE SELECT ON TABLE public.community_members  FROM anon;
REVOKE SELECT ON TABLE public.universities       FROM anon;
REVOKE SELECT ON TABLE public.polls              FROM anon;
REVOKE SELECT ON TABLE public.poll_options       FROM anon;
REVOKE SELECT ON TABLE public.poll_votes         FROM anon;
REVOKE SELECT ON TABLE public.votes              FROM anon;
REVOKE SELECT ON TABLE public.launch_event_config FROM anon;

-- Views (REVOKE on a view uses the relation name directly)
REVOKE SELECT ON public.posts_summary_view    FROM anon;
REVOKE SELECT ON public.comments_with_details FROM anon;
