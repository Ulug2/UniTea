BEGIN;

-- ============================================================
-- chat-images: make the bucket private, add a participant-scoped
-- SELECT policy for signed-URL access
-- ============================================================
--
-- CONTEXT
--
-- chat-images has been a Storage-public bucket: every render path
-- (SupabaseImage.tsx, ResponsiveImage.tsx, the chat fullscreen viewer)
-- resolves images via `.../object/public/chat-images/{path}`, which
-- bypasses storage.objects RLS entirely. If an object path is ever
-- exposed (logs, network inspection, a shared link), the image is
-- fetchable forever by anyone, unauthenticated, independent of chat
-- membership. avatars and post-images are intentionally left public —
-- unchanged by this migration.
--
-- WHY A NEW SELECT POLICY IS REQUIRED (NOT JUST public = false)
--
-- storage.objects already has an owner_id-scoped SELECT policy for
-- chat-images ("Owner can view own chat-images", added by
-- 20260802110000_storage_select_owner_alignment.sql). That policy
-- only matches the object's uploader. It was harmless while the bucket
-- was public (public buckets bypass SELECT RLS for reads entirely,
-- so the policy was never actually exercised for display). Flipping
-- the bucket to private makes SELECT RLS the actual gate for
-- createSignedUrl() — so on its own, only an image's own sender would
-- ever be able to generate a signed URL for it, breaking image display
-- for the *recipient* in every chat. This is the exact trap called out
-- in the task brief: privacy != correct authorization without tracing
-- the actual policy that will now be enforced.
--
-- Live-verified before writing this policy:
--   * chat_messages.image_url stores the exact storage.objects.name
--     (uploadImage()'s returned path) for every image message — 20/20
--     live rows with image_url set have a matching storage object; 0
--     dangling references either direction.
--   * Object path shape is NOT reliable for a folder/chat_id-derived
--     policy: only 1 of 70 chat-images objects has a `{chatId}/...`
--     folder segment (the new deterministic-path upload mode is very
--     recent); the other 69 are flat, pre-existing random filenames
--     with no chat_id embedded in the path at all. A path-derived
--     policy would silently fail to authorize the vast majority of
--     existing images.
--   * The correct, existing authorization boundary for "can this user
--     see this image" is chat_messages_view — already the sole client
--     read path for message content (participant check + block-scope
--     redaction, anonymous-chat-aware). It is owned by `postgres`
--     (rolbypassrls = true), so querying it from inside another RLS
--     policy evaluates its own WHERE clause instead of re-triggering
--     chat_messages' own restrictive "non-anonymous only" SELECT
--     policy — required because 4 of the 20 live image messages belong
--     to anonymous chats, where direct chat_messages SELECT is blocked
--     by design (see can_read_chat_message_directly()).
--
-- New policy below joins storage.objects.name to
-- chat_messages_view.image_url — this covers every existing object
-- regardless of path shape, and reuses the exact same authorization
-- already applied to the message's own content and image_url column.
-- The 50 chat-images objects with no matching chat_messages row at all
-- (already-deleted/orphaned uploads, live-verified, 0 currently
-- referenced by any message) simply become unreachable by anyone,
-- which is a strict tightening, not a regression — nothing renders
-- them today either.
--
-- The pre-existing "Owner can view own chat-images" policy is left in
-- place (not dropped): Postgres ORs multiple permissive SELECT
-- policies for the same command, so it continues to make an object
-- visible to its own uploader independent of the new policy — this is
-- what keeps the owner-scoped UPDATE/DELETE policies working exactly
-- as before (they require the row to already be SELECT-visible; see
-- 20260802110000's own corrective-fix rationale), so "delete for
-- everyone" image cleanup (useChatMessageActions.ts) is unaffected.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH
--   * avatars, post-images buckets/policies — untouched, remain public.
--   * chat-images INSERT/UPDATE/DELETE policies — untouched.
--   * uploadImage() / any upload call site — untouched.
--   * Any RLS on chats/chat_messages/chat_messages_view — untouched.
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'chat-images';

CREATE POLICY "Chat participant can view chat-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM public.chat_messages_view cmv
      WHERE cmv.image_url = storage.objects.name
    )
  );

COMMIT;
