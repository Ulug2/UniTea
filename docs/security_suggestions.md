[
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.comments` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "comments",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_comments"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "view `public.comments_with_details` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "comments_with_details",
      "type": "view",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_comments_with_details"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.communities` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "communities",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_communities"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.community_members` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "community_members",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_community_members"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.launch_event_config` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "launch_event_config",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_launch_event_config"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.poll_options` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "poll_options",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_poll_options"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.poll_votes` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "poll_votes",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_poll_votes"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.polls` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "polls",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_polls"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.post_stats` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "post_stats",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_post_stats"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.posts` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "posts",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_posts"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "view `public.posts_summary_view` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "posts_summary_view",
      "type": "view",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_posts_summary_view"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.profiles` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "profiles",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_profiles"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.universities` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "universities",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_universities"
  },
  {
    "name": "pg_graphql_anon_table_exposed",
    "title": "Public Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to anyone using your public anon key. Revoke `SELECT` from `anon` for objects that should not be discoverable before sign-in, and check lint 0027 for the matching signed-in-user exposure.",
    "detail": "table `public.votes` is visible in the GraphQL schema because the `anon` role can `SELECT` it. Revoke `SELECT` from `anon` if it should not be discoverable without signing in.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed",
    "metadata": {
      "name": "votes",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_anon_table_exposed_public_votes"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.admin_action_logs` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "admin_action_logs",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_admin_action_logs"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.blocks` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "blocks",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_blocks"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.bookmarks` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "bookmarks",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_bookmarks"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.chat_messages` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "chat_messages",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_chat_messages"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.chats` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "chats",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_chats"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.comments` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "comments",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_comments"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "view `public.comments_with_details` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "comments_with_details",
      "type": "view",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_comments_with_details"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.communities` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "communities",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_communities"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.community_members` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "community_members",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_community_members"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.daily_stats_snapshots` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "daily_stats_snapshots",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_daily_stats_snapshots"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.launch_event_config` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "launch_event_config",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_launch_event_config"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.launch_event_matches` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "launch_event_matches",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_launch_event_matches"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.launch_event_message_windows` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "launch_event_message_windows",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_launch_event_message_windows"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.launch_event_profiles` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "launch_event_profiles",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_launch_event_profiles"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.notification_settings` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "notification_settings",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_notification_settings"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.notifications` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "notifications",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_notifications"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.poll_options` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "poll_options",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_poll_options"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.poll_votes` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "poll_votes",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_poll_votes"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.polls` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "polls",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_polls"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.post_stats` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "post_stats",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_post_stats"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.posts` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "posts",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_posts"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "view `public.posts_summary_view` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "posts_summary_view",
      "type": "view",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_posts_summary_view"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.profiles` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "profiles",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_profiles"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.reports` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "reports",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_reports"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.universities` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "universities",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_universities"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.user_activity_events` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "user_activity_events",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_user_activity_events"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "view `public.user_chats_summary` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "user_chats_summary",
      "type": "view",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_user_chats_summary"
  },
  {
    "name": "pg_graphql_authenticated_table_exposed",
    "title": "Signed-In Users Can See Object in GraphQL Schema",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects tables, views, materialized views, and foreign tables that are visible in the GraphQL schema to signed-in users. Revoke `SELECT` from `authenticated` for objects that signed-in users should not discover, and check lint 0026 for the matching public exposure.",
    "detail": "table `public.votes` is visible in the GraphQL schema to signed-in users because the `authenticated` role can `SELECT` it. Revoke `SELECT` from `authenticated` if it should not be discoverable to every account.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed",
    "metadata": {
      "name": "votes",
      "type": "table",
      "schema": "public"
    },
    "cache_key": "pg_graphql_authenticated_table_exposed_public_votes"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.check_message_rate_limit(p_user_id uuid, p_chat_id uuid, p_max_messages integer, p_time_window_minutes integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/check_message_rate_limit`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "check_message_rate_limit",
      "schema": "public",
      "language": "sql",
      "arguments": "p_user_id uuid, p_chat_id uuid, p_max_messages integer, p_time_window_minutes integer",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_check_message_rate_limit_p_user_id uuid, p_chat_id uuid, p_max_messages integer, p_time_window_minutes integer"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/check_rate_limit`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "check_rate_limit",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "p_key text, p_max_requests integer, p_window_seconds integer",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_check_rate_limit_p_key text, p_max_requests integer, p_window_seconds integer"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.compute_daily_stats(target_date date)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/compute_daily_stats`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "compute_daily_stats",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "target_date date",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_compute_daily_stats_target_date date"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.count_distinct_active_users(p_event text, p_days integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/count_distinct_active_users`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "count_distinct_active_users",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "p_event text, p_days integer",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_count_distinct_active_users_p_event text, p_days integer"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.count_distinct_active_users_action(p_days integer)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/count_distinct_active_users_action`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "count_distinct_active_users_action",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "p_days integer",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_count_distinct_active_users_action_p_days integer"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.count_today_dau(p_since timestamp with time zone)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/count_today_dau`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "count_today_dau",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "p_since timestamp with time zone",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_count_today_dau_p_since timestamp with time zone"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.delete_user_account()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/delete_user_account`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "delete_user_account",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_delete_user_account_"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.get_community_university_id(p_community_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/get_community_university_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "get_community_university_id",
      "schema": "public",
      "language": "sql",
      "arguments": "p_community_id uuid",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_get_community_university_id_p_community_id uuid"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.get_my_is_admin()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/get_my_is_admin`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "get_my_is_admin",
      "schema": "public",
      "language": "sql",
      "arguments": "",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_get_my_is_admin_"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.get_my_match()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/get_my_match`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "get_my_match",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_get_my_match_"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.get_my_university_id()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/get_my_university_id`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "get_my_university_id",
      "schema": "public",
      "language": "sql",
      "arguments": "",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_get_my_university_id_"
  },
  {
    "name": "authenticated_security_definer_function_executable",
    "title": "Signed-In Users Can Execute SECURITY DEFINER Function",
    "level": "WARN",
    "facing": "EXTERNAL",
    "categories": [
      "SECURITY"
    ],
    "description": "Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it.",
    "detail": "Function `public.reset_matchmaking_event()` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/reset_matchmaking_event`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.",
    "remediation": "https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable",
    "metadata": {
      "name": "reset_matchmaking_event",
      "schema": "public",
      "language": "plpgsql",
      "arguments": "",
      "security_definer": true
    },
    "cache_key": "authenticated_security_definer_function_executable_public_reset_matchmaking_event_"
  }
]