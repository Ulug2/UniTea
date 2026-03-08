-- ============================================================
-- Migration: Add ON DELETE CASCADE / SET NULL to FK constraints
-- so that deleting a post, comment, poll, or chat cascades to
-- all related rows automatically at the database level.
-- ============================================================

-- ── votes ────────────────────────────────────────────────────
-- Deleting a post removes all its votes
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_post_id_fkey,
  ADD CONSTRAINT votes_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

-- Deleting a comment removes all its votes
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_comment_id_fkey,
  ADD CONSTRAINT votes_comment_id_fkey
    FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

-- ── comments ─────────────────────────────────────────────────
-- Deleting a post removes all its comments
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_post_id_fkey,
  ADD CONSTRAINT comments_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

-- Deleting a parent comment removes all reply comments
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_parent_comment_id_fkey,
  ADD CONSTRAINT comments_parent_comment_id_fkey
    FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;

-- ── bookmarks ────────────────────────────────────────────────
-- Deleting a post removes all bookmarks pointing to it
ALTER TABLE public.bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_post_id_fkey,
  ADD CONSTRAINT bookmarks_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

-- ── notifications ────────────────────────────────────────────
-- Keep the notification row but clear the reference when the post is gone
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_related_post_id_fkey,
  ADD CONSTRAINT notifications_related_post_id_fkey
    FOREIGN KEY (related_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

-- Keep the notification row but clear the reference when the comment is gone
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_related_comment_id_fkey,
  ADD CONSTRAINT notifications_related_comment_id_fkey
    FOREIGN KEY (related_comment_id) REFERENCES public.comments(id) ON DELETE SET NULL;

-- ── polls / poll_options / poll_votes ────────────────────────
-- Deleting a post removes its poll
ALTER TABLE public.polls
  DROP CONSTRAINT IF EXISTS polls_post_id_fkey,
  ADD CONSTRAINT polls_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;

-- Deleting a poll removes its options
ALTER TABLE public.poll_options
  DROP CONSTRAINT IF EXISTS poll_options_poll_id_fkey,
  ADD CONSTRAINT poll_options_poll_id_fkey
    FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;

-- Deleting a poll removes all votes cast in it
ALTER TABLE public.poll_votes
  DROP CONSTRAINT IF EXISTS poll_votes_poll_id_fkey,
  ADD CONSTRAINT poll_votes_poll_id_fkey
    FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;

-- Deleting a poll option removes votes for that option
ALTER TABLE public.poll_votes
  DROP CONSTRAINT IF EXISTS poll_votes_option_id_fkey,
  ADD CONSTRAINT poll_votes_option_id_fkey
    FOREIGN KEY (option_id) REFERENCES public.poll_options(id) ON DELETE CASCADE;

-- ── reports ──────────────────────────────────────────────────
-- Keep report history but clear the post/comment reference if deleted
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_post_id_fkey,
  ADD CONSTRAINT reports_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_comment_id_fkey,
  ADD CONSTRAINT reports_comment_id_fkey
    FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE SET NULL;

-- ── chats ────────────────────────────────────────────────────
-- Keep the chat conversation even if the linked post is deleted
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_post_id_fkey,
  ADD CONSTRAINT chats_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

-- Deleting a chat removes all its messages
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_chat_id_fkey,
  ADD CONSTRAINT chat_messages_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

-- ── reposts ──────────────────────────────────────────────────
-- Keep the repost but clear the reference to the original post if it is deleted
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_reposted_from_post_id_fkey,
  ADD CONSTRAINT posts_reposted_from_post_id_fkey
    FOREIGN KEY (reposted_from_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;
