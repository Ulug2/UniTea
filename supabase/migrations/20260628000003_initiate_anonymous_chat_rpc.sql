-- Fix: anonymous chat initiation broken by C1 (user_id redaction in view).
--
-- posts_summary_view now returns user_id = NULL for other users' anonymous
-- posts. The client therefore passes participant_2_id = NULL to the chats
-- INSERT, which fails the university-equality RLS check.
--
-- Solution: a SECURITY DEFINER RPC that reads the real user_id directly
-- from the posts table (bypassing view redaction) and performs the INSERT
-- itself, so the client never needs to know the anonymous author's identity.

CREATE OR REPLACE FUNCTION public.initiate_anonymous_chat(p_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_author_id  uuid;
  v_chat_id    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Read the real author from the base table, bypassing view redaction.
  SELECT user_id INTO v_author_id
  FROM public.posts
  WHERE id = p_post_id
    AND is_anonymous = true
    AND (is_deleted = false OR is_deleted IS NULL);

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'post not found or not anonymous';
  END IF;

  IF v_caller_id = v_author_id THEN
    RAISE EXCEPTION 'cannot start a chat with yourself';
  END IF;

  -- Return existing chat for this (post, initiator) pair.
  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE post_id    = p_post_id
    AND initiator_id = v_caller_id
    AND is_anonymous = true;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Insert; handle the race where two requests land simultaneously.
  BEGIN
    INSERT INTO public.chats (
      participant_1_id, participant_2_id,
      post_id, initiator_id, is_anonymous
    ) VALUES (
      v_caller_id, v_author_id,
      p_post_id, v_caller_id, true
    )
    RETURNING id INTO v_chat_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_chat_id
    FROM public.chats
    WHERE post_id    = p_post_id
      AND initiator_id = v_caller_id
      AND is_anonymous = true;
  END;

  RETURN v_chat_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.initiate_anonymous_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_anonymous_chat(uuid) TO authenticated;
