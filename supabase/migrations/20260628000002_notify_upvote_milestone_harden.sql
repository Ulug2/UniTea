-- Re-assert REVOKE on notify_upvote_milestone after the 20260624000002 CREATE OR REPLACE.
-- PostgreSQL preserves ACL through CREATE OR REPLACE, but this makes the intent explicit
-- and ensures security holds even if migration order changes.
REVOKE EXECUTE ON FUNCTION public.notify_upvote_milestone() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_upvote_milestone() FROM anon, authenticated;
