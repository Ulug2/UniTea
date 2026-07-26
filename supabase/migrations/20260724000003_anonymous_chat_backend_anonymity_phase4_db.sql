-- ============================================================
-- Anonymous chat backend anonymity — Phase 4 (database half) of 4
--
-- This migration closes out the database side of the anonymous-chat
-- anonymity work: it fixes a pre-existing view (user_chats_summary) that
-- was never part of Phases 1-3 despite touching the same tables, and
-- adds three SECURITY DEFINER RPCs that Phase 1's restrictive policy
-- makes necessary for operations that used to be plain client-side
-- .update()/.delete() calls against chat_messages/chats.
--
-- All four items below were identified during a scope-lock review
-- BEFORE this file was written: an exhaustive grep of every view (only
-- three exist in the whole schema; only user_chats_summary touches
-- chats/chat_messages), every RLS policy on every table (only chats' and
-- chat_messages' own policies reference either table — confirmed no
-- other table's policy has the same cross-table-subquery exposure), and
-- every function/edge function (only initiate_anonymous_chat and
-- notify_chat_message reference these tables, both already SECURITY
-- DEFINER). Nothing here was discovered mid-implementation.
--
-- ============================================================
-- 1. user_chats_summary — fixes a real gap Phases 1-3 never touched
-- ============================================================
-- This view predates this entire migration set (20260405120000). It
-- selects c.participant_1_id/participant_2_id with NO redaction, and is
-- security_invoker = true. Two distinct problems, not one:
--   (a) Before Phase 1 ships, it's a live, unaddressed leak of the exact
--       same shape everything else in this migration set closes.
--   (b) After Phase 1 ships, being invoker-mode means it inherits the
--       restrictive policy on `chats` — so instead of leaking, anonymous
--       chats would simply vanish from every consumer of this view
--       (chat list screen, chat/[id].tsx's own chat-summaries query,
--       useGlobalUnreadCount.ts, usePushNotifications.ts) with no error,
--       a silent functional regression.
--
-- Fix: switch to the same owner-privileged pattern as chats_view/
-- chat_messages_view (Phase 1), with an explicit participant WHERE
-- clause replacing the one it used to get for free via invoker-mode RLS,
-- and the same CASE WHEN redaction on the two participant columns. Every
-- other column and the internal per-participant subqueries (message
-- preview, unread counts) are untouched — they don't reference identity,
-- only content/counts already scoped per viewer, so they're not part of
-- what needs to change and are reproduced verbatim from the live
-- definition (confirmed via `supabase db dump --linked`).
--
-- Also picked up the same bidirectional block filter added to
-- chat_messages_view during this same review (see that file):
-- isBlockedChat today hides a blocked anonymous chat from the list by
-- comparing the (currently real) partner id against the blocks list
-- client-side -- once that id is redacted, the comparison can never
-- match, so the row must be filtered out here instead, in the WHERE
-- clause, to reproduce the same "hide the whole conversation" behavior.
--
-- CREATE OR REPLACE VIEW is used, not DROP+CREATE, specifically so this
-- stays the *same* view under the *same* name — every existing client
-- query naming "user_chats_summary" keeps working unchanged; only the
-- redaction behavior changes. (Postgres allows changing security_invoker
-- and wrapping existing output columns in an expression via CREATE OR
-- REPLACE as long as the column list's names/types/order are preserved,
-- which they are here.)
CREATE OR REPLACE VIEW public.user_chats_summary
WITH (security_invoker = false) AS
SELECT
  c.id AS chat_id,
  CASE
    WHEN c.is_anonymous AND c.participant_1_id <> auth.uid() THEN NULL
    ELSE c.participant_1_id
  END AS participant_1_id,
  CASE
    WHEN c.is_anonymous AND c.participant_2_id <> auth.uid() THEN NULL
    ELSE c.participant_2_id
  END AS participant_2_id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
         CASE WHEN cm.user_id = c.participant_1_id THEN 'You deleted this message' ELSE 'This message was deleted' END
       ELSE cm.content
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p1,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
       ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p1,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
         CASE WHEN cm.user_id = c.participant_2_id THEN 'You deleted this message' ELSE 'This message was deleted' END
       ELSE cm.content
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p2,
  (SELECT
     CASE
       WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
       ELSE cm.image_url IS NOT NULL AND cm.image_url <> ''
     END
   FROM public.chat_messages cm
   WHERE cm.chat_id = c.id
     AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
          OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
                  OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
   ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p2,
  (SELECT count(*) FROM public.chat_messages cm
   WHERE cm.chat_id = c.id AND cm.user_id = c.participant_2_id AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p1,
  (SELECT count(*) FROM public.chat_messages cm
   WHERE cm.chat_id = c.id AND cm.user_id = c.participant_1_id AND cm.is_read = false
     AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p2,
  c.is_anonymous,
  c.initiator_id
FROM public.chats c
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.chat_id = c.id)
  -- Same bidirectional block rule as chat_messages_view (Phase 1) and
  -- broadcast_anonymous_chat_message() (Phase 3), applied here to match
  -- isBlockedChat's existing "hide the whole conversation" behavior --
  -- previously done entirely client-side by comparing against
  -- participant_1_id/participant_2_id, which no longer works once those
  -- are redacted for the counterpart in an anonymous chat.
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid()
           AND b.blocked_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END)
           AND b.block_scope = 'profile_only')
       OR (b.blocked_id = auth.uid()
           AND b.blocker_id = (CASE WHEN c.participant_1_id = auth.uid() THEN c.participant_2_id ELSE c.participant_1_id END))
  );

REVOKE ALL ON public.user_chats_summary FROM PUBLIC;
GRANT SELECT ON public.user_chats_summary TO authenticated;

-- ============================================================
-- 2. mark_anonymous_chat_read(p_chat_id uuid)
-- ============================================================
-- Replaces chat/[id].tsx's and useChatMessagesRealtime.ts's plain
-- `.from("chat_messages").update({is_read:true}).eq("chat_id",id)
-- .eq("is_read",false).neq("user_id",currentUserId)` for anonymous
-- chats only -- that UPDATE's row-location depends on chat_messages'
-- SELECT policy (can_read_chat_message_directly, Phase 1), which is
-- false for anonymous rows by design, so it silently matches zero rows
-- today. Mirrors the exact same WHERE conditions as the RPC body below,
-- just performed with is_chat_participant()'s RLS-bypassing check
-- standing in for the base table's own (deliberately more restrictive)
-- SELECT policy.
CREATE OR REPLACE FUNCTION public.mark_anonymous_chat_read(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_chat_participant(p_chat_id) THEN
    RAISE EXCEPTION 'chat not found or you are not a participant';
  END IF;

  UPDATE public.chat_messages
  SET is_read = true
  WHERE chat_id = p_chat_id
    AND is_read = false
    AND user_id <> v_caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_anonymous_chat_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_anonymous_chat_read(uuid) TO authenticated;

-- ============================================================
-- 3. set_anonymous_chat_message_deletion(p_message_id uuid, p_action text)
-- ============================================================
-- Replaces useChatMessageActions.ts's delete-for-me/delete-for-everyone
-- `.update({deleted_by_sender/deleted_by_receiver})` for anonymous chats
-- only -- same UPDATE-needs-SELECT-visibility issue as above.
--
-- The "only the sender may delete_for_everyone" rule is enforced here
-- server-side by deriving the sender from the row itself, rather than
-- trusting a client-asserted `isSender` flag the way today's client code
-- implicitly does (it only ever offers the "delete for everyone" menu
-- item for the caller's own messages, but the underlying RLS never
-- actually checked this). This is not a new restriction for any honest
-- client -- the app never lets you construct that call today -- it just
-- removes reliance on the client to self-police something the RPC has to
-- look up anyway.
CREATE OR REPLACE FUNCTION public.set_anonymous_chat_message_deletion(p_message_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_chat_id uuid;
  v_sender_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_action NOT IN ('delete_for_me', 'delete_for_everyone') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  SELECT chat_id, user_id INTO v_chat_id, v_sender_id
  FROM public.chat_messages
  WHERE id = p_message_id;

  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  IF NOT public.is_chat_participant(v_chat_id) THEN
    RAISE EXCEPTION 'you are not a participant of this chat';
  END IF;

  IF p_action = 'delete_for_everyone' THEN
    IF v_sender_id <> v_caller_id THEN
      RAISE EXCEPTION 'only the sender can delete a message for everyone';
    END IF;
    UPDATE public.chat_messages
    SET deleted_by_sender = true, deleted_by_receiver = true
    WHERE id = p_message_id;
  ELSE
    IF v_sender_id = v_caller_id THEN
      UPDATE public.chat_messages SET deleted_by_sender = true WHERE id = p_message_id;
    ELSE
      UPDATE public.chat_messages SET deleted_by_receiver = true WHERE id = p_message_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_anonymous_chat_message_deletion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_anonymous_chat_message_deletion(uuid, text) TO authenticated;

-- ============================================================
-- 4. delete_anonymous_chat(p_chat_id uuid)
-- ============================================================
-- Replaces chat/[id].tsx's deleteChatMutation for anonymous chats: the
-- existing flow does a chat_messages bulk DELETE, and -- if that fails --
-- falls back to a soft-delete UPDATE, then deletes the chats row itself.
-- All three of those base-table operations depend on the same
-- SELECT-visibility mechanism and fail identically for anonymous chats
-- (confirmed empirically), including the fallback, so today's two-layer
-- safety net has no working layer left for anonymous chats without this.
--
-- Also covers the "abandoned empty chat" cleanup effect in the same
-- file (deletes a chat with zero messages on unmount) -- same operation,
-- just called with nothing in chat_messages to delete.
CREATE OR REPLACE FUNCTION public.delete_anonymous_chat(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_chat_participant(p_chat_id) THEN
    RAISE EXCEPTION 'chat not found or you are not a participant';
  END IF;

  DELETE FROM public.chat_messages WHERE chat_id = p_chat_id;
  DELETE FROM public.chats WHERE id = p_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_anonymous_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_anonymous_chat(uuid) TO authenticated;

-- ============================================================
-- ROLLBACK
-- ============================================================
--   DROP FUNCTION IF EXISTS public.delete_anonymous_chat(uuid);
--   DROP FUNCTION IF EXISTS public.set_anonymous_chat_message_deletion(uuid, text);
--   DROP FUNCTION IF EXISTS public.mark_anonymous_chat_read(uuid);
--
--   CREATE OR REPLACE VIEW public.user_chats_summary
--   WITH (security_invoker = true) AS
--   SELECT
--     c.id AS chat_id,
--     c.participant_1_id,
--     c.participant_2_id,
--     c.post_id,
--     c.created_at,
--     c.last_message_at,
--     (SELECT CASE WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
--        CASE WHEN cm.user_id = c.participant_1_id THEN 'You deleted this message' ELSE 'This message was deleted' END
--        ELSE cm.content END
--      FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
--             OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
--                     OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
--      ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p1,
--     (SELECT CASE WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
--        ELSE cm.image_url IS NOT NULL AND cm.image_url <> '' END
--      FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
--             OR NOT ((cm.user_id = c.participant_1_id AND COALESCE(cm.deleted_by_sender, false))
--                     OR (cm.user_id <> c.participant_1_id AND COALESCE(cm.deleted_by_receiver, false))))
--      ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p1,
--     (SELECT CASE WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN
--        CASE WHEN cm.user_id = c.participant_2_id THEN 'You deleted this message' ELSE 'This message was deleted' END
--        ELSE cm.content END
--      FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
--             OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
--                     OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
--      ORDER BY cm.created_at DESC LIMIT 1) AS last_message_content_p2,
--     (SELECT CASE WHEN COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false) THEN false
--        ELSE cm.image_url IS NOT NULL AND cm.image_url <> '' END
--      FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND (COALESCE(cm.deleted_by_sender, false) AND COALESCE(cm.deleted_by_receiver, false)
--             OR NOT ((cm.user_id = c.participant_2_id AND COALESCE(cm.deleted_by_sender, false))
--                     OR (cm.user_id <> c.participant_2_id AND COALESCE(cm.deleted_by_receiver, false))))
--      ORDER BY cm.created_at DESC LIMIT 1) AS last_message_has_image_p2,
--     (SELECT count(*) FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND cm.user_id = c.participant_2_id AND cm.is_read = false
--        AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p1,
--     (SELECT count(*) FROM public.chat_messages cm WHERE cm.chat_id = c.id
--        AND cm.user_id = c.participant_1_id AND cm.is_read = false
--        AND NOT COALESCE(cm.deleted_by_receiver, false)) AS unread_count_p2,
--     c.is_anonymous,
--     c.initiator_id
--   FROM public.chats c
--   WHERE EXISTS (SELECT 1 FROM public.chat_messages cm WHERE cm.chat_id = c.id);
--   -- (verbatim pre-Phase-4 body, reproduced from `supabase db dump --linked`
--   -- taken before this migration — restores no-redaction, invoker-mode
--   -- behavior exactly as it was.)
--
-- ============================================================
-- VERIFICATION (see full results in the report accompanying this file)
-- ============================================================
-- Verified against the same real local Postgres instance used for
-- Phases 1-3:
--   * user_chats_summary: non-participant gets zero rows; each
--     participant of an anonymous chat sees their own id and NULL for
--     the counterpart, with last-message preview/unread counts
--     unaffected; a non-anonymous chat's row is completely unredacted on
--     both sides, unchanged from before this migration.
--   * mark_anonymous_chat_read: genuine participant marks the
--     counterpart's messages read correctly (and only those, own
--     messages untouched); a non-participant is rejected.
--   * set_anonymous_chat_message_deletion: sender can delete_for_everyone
--     on their own message; recipient attempting delete_for_everyone on
--     the sender's message is rejected; either side can delete_for_me on
--     the other's message; a non-participant is rejected; an invalid
--     action string is rejected.
--   * delete_anonymous_chat: genuine participant deletes both the
--     messages and the chat row; a non-participant is rejected; works
--     identically for a chat with zero messages (the cleanup-effect
--     case).
-- ============================================================
