-- ============================================================
-- Prevent duplicate non-anonymous chats for the same (user pair, post).
--
-- For non-anonymous posts, the client now does a canonical-pair
-- lookup before inserting to reuse any existing non-anonymous
-- chat between the two users.  This index ensures that even under
-- concurrent inserts from the same post, only one chat is created
-- per (participant_1, participant_2, post_id) tuple.
--
-- Anonymous-post chats already have idx_chats_anon_lookup.
-- Matchmaking chats (post_id IS NULL) have their own constraint via the
-- client (canonical ordering + maybeSingle check).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_non_anon_post_pair
  ON public.chats (participant_1_id, participant_2_id, post_id)
  WHERE is_anonymous = false
    AND post_id IS NOT NULL;
