BEGIN;

-- ============================================================
-- Chat messages: up to 3 images per message
-- ============================================================
--
-- Mirrors posts' image_url + image_urls pattern so installed app builds
-- keep working unchanged:
--   * image_url stays the FIRST image. Older builds only read/write it, so
--     they still send single images exactly as before and show the first
--     image of a multi-image message.
--   * image_urls (new) holds every image in order when a newer build sends
--     one or more images; NULL for messages from older builds.
--
-- Every existing consumer of image_url (chat list has-image flag,
-- notify_chat_message's "📷" text, reply previews) keeps working, because
-- image_url is still set whenever a message has any image.
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_urls text[];

-- 1–3 images, first one mirrored in image_url, and every path inside this
-- message's own chat folder ({chat_id}/...). The folder check stops a client
-- from referencing another chat's image, which the storage SELECT policy
-- below would otherwise authorize for this chat's participants. image_url
-- itself is intentionally NOT constrained: older builds may still upload
-- with flat random filenames.
-- CHECK constraints can't contain subqueries, so the per-element folder
-- check lives in this pure helper (not SECURITY DEFINER; reads no tables).
CREATE OR REPLACE FUNCTION public.chat_image_paths_in_chat_folder(p_chat_id uuid, p_paths text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(p.path LIKE p_chat_id::text || '/%'), true)
  FROM unnest(p_paths) AS p(path);
$$;

REVOKE ALL ON FUNCTION public.chat_image_paths_in_chat_folder(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_image_paths_in_chat_folder(uuid, text[]) TO authenticated, service_role;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_image_urls_valid CHECK (
    image_urls IS NULL
    OR (
      cardinality(image_urls) BETWEEN 1 AND 3
      AND image_url IS NOT DISTINCT FROM image_urls[1]
      AND array_position(image_urls, NULL) IS NULL
      AND public.chat_image_paths_in_chat_folder(chat_id, image_urls)
    )
  );

-- Recreated from 20260729000000_include_deletion_state_in_reply_preview.sql
-- unchanged except: image_urls appended as the LAST column (CREATE OR
-- REPLACE VIEW can only add columns at the end) and to the reply_message
-- jsonb.
CREATE OR REPLACE VIEW public.chat_messages_view
WITH (security_invoker = false) AS
SELECT
  cm.id,
  cm.chat_id,
  CASE
    WHEN c.is_anonymous AND cm.user_id <> auth.uid() THEN NULL
    ELSE cm.user_id
  END AS user_id,
  cm.content,
  cm.is_read,
  cm.created_at,
  cm.deleted_by_sender,
  cm.deleted_by_receiver,
  cm.image_url,
  cm.reply_to_id,
  cm.image_aspect_ratio,
  CASE
    WHEN rm.id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'id', rm.id,
      'content', rm.content,
      'image_url', rm.image_url,
      'image_urls', rm.image_urls,
      'user_id', CASE
        WHEN c.is_anonymous AND rm.user_id <> auth.uid() THEN NULL
        ELSE rm.user_id
      END,
      'deleted_by_sender', rm.deleted_by_sender,
      'deleted_by_receiver', rm.deleted_by_receiver
    )
  END AS reply_message,
  cm.image_urls
FROM public.chat_messages cm
JOIN public.chats c ON c.id = cm.chat_id
LEFT JOIN public.chat_messages rm ON rm.id = cm.reply_to_id AND rm.chat_id = cm.chat_id
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = cm.user_id
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
       OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid()
           AND b.block_scope = CASE WHEN c.is_anonymous THEN 'anonymous_only' ELSE 'profile_only' END
           AND (NOT c.is_anonymous OR b.related_chat_id = c.id))
  );

-- Live ACL (verified 2026-09-24) still carried explicit full privileges
-- for anon and authenticated from the project's default-privileges rule;
-- earlier migrations only revoked PUBLIC. The view is read-only (joins) and
-- returns nothing without auth.uid(), so this was inert, but the intended
-- grant is SELECT for authenticated only. The app only ever SELECTs it.
REVOKE ALL ON public.chat_messages_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_messages_view TO authenticated;

-- Recreated from 20260728000000_unify_chat_message_deletion_rpc.sql
-- unchanged except 'image_urls' in the anonymous new_message payload.
CREATE OR REPLACE FUNCTION public.broadcast_anonymous_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_anonymous boolean;
  v_recipient_id uuid;
BEGIN
  SELECT
    is_anonymous,
    CASE WHEN participant_1_id = NEW.user_id THEN participant_2_id ELSE participant_1_id END
  INTO v_is_anonymous, v_recipient_id
  FROM public.chats
  WHERE id = NEW.chat_id;

  IF v_is_anonymous IS NOT TRUE OR v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;

  IF public.is_anonymous_chat_relationship_blocked(NEW.chat_id, NEW.user_id, v_recipient_id) THEN
    RETURN NEW;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'chat_id', NEW.chat_id,
      'content', NEW.content,
      'image_url', NEW.image_url,
      'image_urls', NEW.image_urls,
      'image_aspect_ratio', NEW.image_aspect_ratio,
      'created_at', NEW.created_at,
      'is_read', NEW.is_read,
      'reply_to_id', NEW.reply_to_id
    ),
    'new_message',
    'anon-chat-message:' || NEW.chat_id::text || ':' || v_recipient_id::text,
    true
  );

  PERFORM realtime.send(
    jsonb_build_object(
      'chat_id', NEW.chat_id,
      'last_message_at', NEW.created_at
    ),
    'chat_updated',
    'chats:' || v_recipient_id::text,
    true
  );

  PERFORM realtime.send(
    jsonb_build_object(
      'chat_id', NEW.chat_id,
      'last_message_at', NEW.created_at
    ),
    'chat_updated',
    'chats:' || NEW.user_id::text,
    true
  );

  RETURN NEW;
END;
$$;

-- Same grants as after 20260817020000 (trigger-only; no anon/PUBLIC EXECUTE).
REVOKE ALL ON FUNCTION public.broadcast_anonymous_chat_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_anonymous_chat_message() FROM anon;

-- Participants may read every image of a message they can see, not just
-- the first (20260817000000 only matched image_url).
DROP POLICY IF EXISTS "Chat participant can view chat-images" ON storage.objects;
CREATE POLICY "Chat participant can view chat-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.chat_messages_view cmv
      WHERE cmv.image_url = storage.objects.name
         OR storage.objects.name = ANY (cmv.image_urls)
    )
  );

COMMIT;
