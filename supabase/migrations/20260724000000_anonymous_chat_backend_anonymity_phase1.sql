-- ============================================================
-- Anonymous chat backend anonymity — Phase 1 of 4
--
-- PROBLEM: anonymous chats look anonymous in the UI only. The client
-- intentionally skips fetching/displaying the partner's profile for
-- is_anonymous chats, but that is a UI convenience, not a security
-- boundary. chats.participant_1/2_id and chat_messages.user_id always
-- hold the REAL auth.users UUID (required for RLS, blocking, unread
-- counts, etc.), and "Read profiles in my university" lets any
-- same-university user resolve a UUID to a full profile. So a user who
-- obtains their anonymous partner's UUID via a direct chats/chat_messages
-- read (or, until Phase 3 ships, the Realtime WebSocket) can deanonymize
-- them by querying profiles directly, bypassing the client-side gate
-- entirely (e.g. via the Supabase client directly, or a raw REST call).
--
-- THIS MIGRATION (Phase 1) closes the REST-level base-table read vector:
--   1. Two new views, chats_view / chat_messages_view, are the ONLY way
--      to read a chat/message row with the counterpart's identity intact
--      for non-anonymous chats, and with it correctly NULLed for
--      anonymous ones.
--   2. A restrictive policy on `chats`, plus two SECURITY DEFINER helper
--      functions that replace four existing chat_messages policies, make
--      anonymous rows unreadable via the base tables for EVERYONE,
--      including their own genuine participants — forcing all reads
--      through the views above.
--
-- Phase 2 adds block_chat_partner() so blocking keeps working without the
-- client ever holding the raw ID. Phase 3 replaces Realtime delivery for
-- anonymous chats only (Broadcast-from-Database), because the restrictive
-- policy also silences postgres_changes for anonymous rows (Realtime
-- re-evaluates SELECT RLS per row).
--
-- IMPORTANT — everything in section 0 below was verified against a real
-- local Postgres instance (a from-scratch container loaded with the exact
-- table/policy DDL pulled from the live project via `supabase db dump
-- --linked`, not a mock), because the interactions are genuinely
-- non-obvious — see section 0's comment for the full explanation and
-- VERIFICATION at the end of this file for the actual test queries and
-- results.
--
-- ============================================================
-- WHY public.profiles RLS IS DELIBERATELY **NOT** TOUCHED HERE
-- ============================================================
-- The obvious-looking fix — restrict `profiles` SELECT based on "does an
-- anonymous chat exist between these two users" — was considered and
-- rejected. posts_summary_view and comments_with_details are
-- security_invoker = true and INNER JOIN profiles. A relationship-based
-- restrictive policy on profiles would silently drop a person's
-- *unrelated, non-anonymous* posts/comments from the other party's feed
-- for as long as the chats row exists (INNER JOIN + RLS-hidden profile
-- row = no match = the whole post/comment row vanishes). That is a real,
-- hard-to-notice regression, not a hypothetical. profiles RLS stays
-- exactly as it was; all redaction for chats happens in chat-specific
-- read paths (this migration) instead.
--
-- ============================================================
-- WHY A RESTRICTIVE POLICY (NOT A REVOKE OR A profiles-STYLE FIX)
-- ============================================================
-- A blanket `REVOKE SELECT` on chats/chat_messages from `authenticated`
-- was also considered and rejected: every direct base-table call site was
-- audited across src/ (useInitiateAnonymousChat.ts, the non-anonymous
-- branch; useInitiateMatchChat.ts for matchmaking; lostfoundpost/[id].tsx
-- and LostFoundListItem.tsx for the Lost & Found contact flow;
-- useChatSendMessage.ts) and every one of them filters
-- `.eq('participant_1_id', ...)` / `.eq('is_anonymous', false)` directly
-- against the base tables — none of them ever touches an is_anonymous=true
-- row, but a blanket REVOKE breaks their WHERE-clause privilege checks and
-- any INSERT ... RETURNING regardless of anonymity (Postgres requires
-- SELECT privilege on RETURNING columns). That is a much bigger blast
-- radius than needed and would touch normal (non-anonymous) chat
-- architecture, which this fix must not do.
--
-- A RESTRICTIVE policy scoped to `is_anonymous = true` rows only has none
-- of that blast radius: restrictive policies AND with the existing
-- permissive "participant" policies (they only ever remove visibility,
-- never add it), and since no non-anonymous call site ever queries an
-- anonymous row, every one of the call sites above is completely
-- unaffected. Anonymous rows simply become invisible through the base
-- tables for everyone, including their own participants — the views
-- below are the only remaining path to read them, and they redact
-- correctly by construction.
--
-- ============================================================
-- ROLLBACK
-- ============================================================
-- No data is altered by this migration (no column/table changes, no
-- writes), so rollback cannot lose data. It DOES replace FOUR existing
-- chat_messages policies (SELECT, INSERT, UPDATE, DELETE — see section
-- 0), so a full rollback restores their original definitions rather than
-- just dropping new objects:
--
--   DROP POLICY IF EXISTS "Block direct reads of anonymous chats" ON public.chats;
--   DROP VIEW IF EXISTS public.chat_messages_view;
--   DROP VIEW IF EXISTS public.chats_view;
--
--   DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.chat_messages;
--   CREATE POLICY "Users can view messages in their chats" ON public.chat_messages
--     FOR SELECT USING (EXISTS (
--       SELECT 1 FROM public.chats
--       WHERE chats.id = chat_messages.chat_id
--         AND (chats.participant_1_id = auth.uid() OR chats.participant_2_id = auth.uid())
--     ));
--
--   DROP POLICY IF EXISTS "Allow insert only for chat participants" ON public.chat_messages;
--   CREATE POLICY "Allow insert only for chat participants" ON public.chat_messages
--     FOR INSERT TO authenticated WITH CHECK (
--       (auth.uid() = user_id) AND (EXISTS (
--         SELECT 1 FROM public.chats
--         WHERE chats.id = chat_messages.chat_id
--           AND (chats.participant_1_id = auth.uid() OR chats.participant_2_id = auth.uid())
--       ))
--     );
--
--   DROP POLICY IF EXISTS "Users can update messages in their chats" ON public.chat_messages;
--   CREATE POLICY "Users can update messages in their chats" ON public.chat_messages
--     FOR UPDATE USING (
--       (auth.uid() = user_id) OR (EXISTS (
--         SELECT 1 FROM public.chats
--         WHERE chats.id = chat_messages.chat_id
--           AND (chats.participant_1_id = auth.uid() OR chats.participant_2_id = auth.uid())
--       ))
--     ) WITH CHECK (
--       (auth.uid() = user_id) OR (EXISTS (
--         SELECT 1 FROM public.chats
--         WHERE chats.id = chat_messages.chat_id
--           AND (chats.participant_1_id = auth.uid() OR chats.participant_2_id = auth.uid())
--       ))
--     );
--
--   DROP POLICY IF EXISTS "Users can delete messages from their chats" ON public.chat_messages;
--   CREATE POLICY "Users can delete messages from their chats" ON public.chat_messages
--     FOR DELETE USING (
--       EXISTS (
--         SELECT 1 FROM public.chats
--         WHERE chats.id = chat_messages.chat_id
--           AND (chats.participant_1_id = auth.uid() OR chats.participant_2_id = auth.uid())
--       )
--     );
--
--   DROP FUNCTION IF EXISTS public.can_read_chat_message_directly(uuid);
--   DROP FUNCTION IF EXISTS public.is_chat_participant(uuid);
--
-- (Original policy SQL reproduced verbatim from `supabase db dump --linked`
-- taken before this migration, so rollback restores the exact prior text.)
--
-- ============================================================
-- DEPLOYMENT SEQUENCING
-- ============================================================
-- This migration must be deployed together with Phase 2 (block_chat_partner),
-- Phase 3 (Realtime), and Phase 4 (the RPCs in section 0's consequence
-- note, plus the matching client release) — never on its own. In
-- isolation, sending a new message into an anonymous chat still works
-- (bare INSERT is unaffected), but reading it back via RETURNING, marking
-- it read, and deleting it via the base table do not, and Realtime
-- delivery for anonymous chats/messages stops entirely (postgres_changes
-- respects the new restrictive policy). All four phases plus the client
-- release that consumes them ship as one coordinated release.
-- ============================================================

-- ── 0. Helper functions, and the FOUR existing chat_messages policies
--      that must be replaced to use them. ──────────────────────────────
--
-- Caught by testing against a real local Postgres instance rather than
-- reasoning about it in the abstract (see VERIFICATION at the end of this
-- file for the actual queries and results) — two separate, non-obvious
-- Postgres RLS behaviors drove this design:
--
-- (a) A subquery inside one table's policy (e.g. chat_messages'
--     INSERT/UPDATE/DELETE policies doing
--     `EXISTS (SELECT 1 FROM public.chats WHERE ...)`) is itself a SELECT
--     against `chats`, executed as the `authenticated` role — so once
--     `chats` gets a restrictive policy hiding anonymous rows (section 3
--     below), that subquery returns FALSE for every anonymous chat, for
--     both genuine participants. Confirmed empirically: without a fix,
--     sending a message into an anonymous chat fails outright ("new row
--     violates row-level security policy"), and marking one as read
--     silently matches zero rows — not a RETURNING-only or realtime-only
--     consequence, it breaks the core INSERT/UPDATE/DELETE path.
--     Fixed by is_chat_participant(): a SECURITY DEFINER helper whose
--     internal SELECT executes with the function owner's privileges,
--     bypassing `chats`' RLS via ownership exemption (the same mechanism
--     chats_view/chat_messages_view rely on below, and the same pattern
--     initiate_anonymous_chat already uses elsewhere in this schema).
--
-- (b) A table's SELECT policy isn't only consulted for direct SELECTs —
--     Postgres also uses it to decide whether INSERT ... RETURNING can
--     hand back the new row, and to locate target rows for UPDATE/DELETE
--     in the first place (confirmed empirically: fixing only the
--     INSERT/UPDATE/DELETE policies per (a) was NOT enough on its own —
--     INSERT ... RETURNING and UPDATE/DELETE via the base table still
--     failed for anonymous chats until the SELECT policy itself was also
--     addressed). This creates a real conflict: chat_messages' SELECT
--     policy can't simultaneously (1) block direct anonymous reads for
--     everyone including genuine participants — the actual goal — AND
--     (2) stay permissive enough for those same participants' own
--     INSERT...RETURNING/UPDATE/DELETE to keep working, because Postgres
--     uses the identical check for both purposes. (1) is required for
--     real anonymity, so it wins: RETURNING, base-table UPDATE
--     (mark-as-read), and base-table DELETE on anonymous messages now
--     fail safely (zero rows affected/returned, no partial writes,
--     verified) rather than silently leaking. A bare INSERT with no
--     RETURNING is unaffected, since it only consults the INSERT
--     policy's WITH CHECK, not the SELECT policy.
--     Enforced by can_read_chat_message_directly(): a second, STRICTER
--     SECURITY DEFINER helper (deliberately separate from
--     is_chat_participant() above) that additionally requires
--     is_anonymous = false, used only by the SELECT policy.
--
-- CONSEQUENCE FOR PHASE 4 (flagged now, not decided silently): sending a
-- message into an anonymous chat still works (bare insert), but the
-- client can no longer request RETURNING on that insert, and marking an
-- anonymous chat's messages as read / deleting them can no longer go
-- through a plain `.update()`/`.delete()` against the base table. Phase 4
-- will need small SECURITY DEFINER RPCs for these (mirroring
-- initiate_anonymous_chat's existing pattern) — a larger Phase 4 scope
-- than originally sketched, not implemented in this migration.
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = p_chat_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_chat_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_chat_message_directly(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = p_chat_id
      AND is_anonymous = false
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_chat_message_directly(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_chat_message_directly(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.chat_messages;
CREATE POLICY "Users can view messages in their chats"
  ON public.chat_messages
  FOR SELECT
  USING (public.can_read_chat_message_directly(chat_id));

DROP POLICY IF EXISTS "Allow insert only for chat participants" ON public.chat_messages;
CREATE POLICY "Allow insert only for chat participants"
  ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id) AND public.is_chat_participant(chat_id)
  );

DROP POLICY IF EXISTS "Users can update messages in their chats" ON public.chat_messages;
CREATE POLICY "Users can update messages in their chats"
  ON public.chat_messages
  FOR UPDATE
  USING ((auth.uid() = user_id) OR public.is_chat_participant(chat_id))
  WITH CHECK ((auth.uid() = user_id) OR public.is_chat_participant(chat_id));

DROP POLICY IF EXISTS "Users can delete messages from their chats" ON public.chat_messages;
CREATE POLICY "Users can delete messages from their chats"
  ON public.chat_messages
  FOR DELETE
  USING (public.is_chat_participant(chat_id));

-- ── 1. chats_view ──────────────────────────────────────────────────────
--
-- Owner-privileged (security_invoker = false), so it is NOT subject to
-- the restrictive policy added below on the base `chats` table — it is
-- the intended bypass. Because it is non-invoker, it does not inherit
-- `chats`' own RLS automatically, so it replicates the existing
-- participant check explicitly in its own WHERE clause (same
-- bypass-with-manual-check pattern this codebase already uses in
-- initiate_anonymous_chat, 20260628000003_initiate_anonymous_chat_rpc.sql).
--
-- For is_anonymous = false rows, both participant columns pass through
-- unchanged — behavior identical to reading the base table today.
-- For is_anonymous = true rows, each participant only ever sees their OWN
-- id in whichever column is theirs; the counterpart's column is NULL,
-- for BOTH sides symmetrically (mirrors the existing UI treatment in
-- getChatDisplayIdentity, which already hides identity from both the
-- initiator and the post author).
CREATE OR REPLACE VIEW public.chats_view
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.post_id,
  c.created_at,
  c.last_message_at,
  c.is_anonymous,
  c.initiator_id,
  CASE
    WHEN c.is_anonymous AND c.participant_1_id <> auth.uid() THEN NULL
    ELSE c.participant_1_id
  END AS participant_1_id,
  CASE
    WHEN c.is_anonymous AND c.participant_2_id <> auth.uid() THEN NULL
    ELSE c.participant_2_id
  END AS participant_2_id
FROM public.chats c
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id);

REVOKE ALL ON public.chats_view FROM PUBLIC;
GRANT SELECT ON public.chats_view TO authenticated;

-- ── 2. chat_messages_view ──────────────────────────────────────────────
--
-- Same owner-privileged / manual-auth-check pattern as chats_view above.
--
-- Identity redaction: `user_id` is nulled for the counterpart's messages
-- in anonymous chats only. Verified safe against every current client
-- usage (chat/[id].tsx, ChatMessageRow, reply attribution, mark-as-read):
-- the client only ever compares `msg.user_id === currentUserId` to decide
-- "mine vs theirs" — it never reads or displays the partner's raw value.
-- The CALLER's own id (on their own messages) is never redacted, so that
-- comparison keeps working correctly.
--
-- Reply preview: `reply_message` is built inline as jsonb instead of via
-- PostgREST's automatic FK-embed syntax, because views do not carry real
-- foreign keys for PostgREST to introspect the way base tables do. The
-- shape matches what the client already expects
-- (`row.reply_message?.id` in features/chat/data/queries.ts), just
-- sourced differently. The replied-to message's OWN sender id is
-- redacted with the identical rule as the top-level row, so a reply
-- quote can never be used as a side channel to leak the counterpart's id
-- either.
--
-- Same-chat constraint on the reply join (`rm.chat_id = cm.chat_id`):
-- `reply_to_id` is never validated against the inserting chat at INSERT
-- time (the "Allow insert only for chat participants" policy only checks
-- that the caller is a participant of *their own* chat_id, not that
-- reply_to_id belongs to it). The original base-table system was safe
-- regardless, because PostgREST's FK-embed respected the embedded row's
-- own "Users can view messages in their chats" RLS independently, so an
-- out-of-chat reply_to_id simply embedded as null unless the caller
-- happened to also be a participant of *that* chat. This view is
-- owner-privileged and bypasses RLS entirely for both cm and rm, so
-- without this explicit constraint it would join to ANY message row in
-- the database regardless of chat — confirmed by test: a message in
-- chat A with reply_to_id pointing at a message in unrelated chat B
-- returned chat B's real content through chat A's reply preview, to a
-- caller with no access to chat B at all. `rm.chat_id = cm.chat_id`
-- closes this — a content leak across arbitrary chats, not just an
-- identity leak. See VERIFICATION at the end of this file for the
-- reproduction and confirmation of the fix.
--
-- Server-side block filtering: excludes cm.user_id if EITHER (I blocked
-- them with profile_only) OR (they blocked me, any scope — coerced to
-- profile_only-equivalent from my side). This replicates the exact
-- bidirectional rule the client's merged block list already applies
-- (src/hooks/useBlocks.ts): "someone blocked me" is folded in as
-- scope='profile_only' from my perspective regardless of the scope they
-- actually chose, in addition to "I blocked them with profile_only". This
-- can't be left to the client alone: once user_id is redacted for the
-- counterpart (this view's whole purpose), the client-side filters that
-- used to enforce this (features/chat/types.ts selectMessages,
-- useChatMessagesRealtime's isBlockedDirectMessage) compare against a
-- now-nulled value and can never match again — a blocked user's
-- anonymous messages would otherwise stop being filtered out. Verified
-- against a real Postgres instance — see VERIFICATION at the end of this
-- file.
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
      'user_id', CASE
        WHEN c.is_anonymous AND rm.user_id <> auth.uid() THEN NULL
        ELSE rm.user_id
      END
    )
  END AS reply_message
FROM public.chat_messages cm
JOIN public.chats c ON c.id = cm.chat_id
LEFT JOIN public.chat_messages rm ON rm.id = cm.reply_to_id AND rm.chat_id = cm.chat_id
WHERE auth.uid() IN (c.participant_1_id, c.participant_2_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = cm.user_id AND b.block_scope = 'profile_only')
       OR (b.blocker_id = cm.user_id AND b.blocked_id = auth.uid())
  );

REVOKE ALL ON public.chat_messages_view FROM PUBLIC;
GRANT SELECT ON public.chat_messages_view TO authenticated;

-- ── 3. Restrictive policy on chats: the actual enforcement ─────────────
--
-- RESTRICTIVE policies AND with every existing PERMISSIVE policy on the
-- same table/command — they can only ever narrow visibility, never
-- widen it. This says "a chats row is visible via the base table only if
-- it is also non-anonymous", on top of whatever the existing permissive
-- "participant" policy already allows. Scoped to is_anonymous rows only,
-- so every audited non-anonymous call site (matchmaking, Lost & Found,
-- non-anonymous initiate/send) is completely unaffected — confirmed none
-- of them ever query an is_anonymous = true row.
--
-- Once active, anonymous `chats` rows are invisible via the base table to
-- EVERY caller, including the row's own participants — chats_view above
-- is the only remaining path to read them.
--
-- chat_messages does NOT get an equivalent restrictive policy of its
-- own — it doesn't need one, because its SELECT policy (section 0,
-- can_read_chat_message_directly) already encodes the same is_anonymous
-- check directly. A restrictive policy on chat_messages produces the
-- identical row-visibility outcome but also breaks bare INSERTs into
-- anonymous chats outright (confirmed empirically — a RESTRICTIVE SELECT
-- policy is also consulted for INSERT's WITH CHECK), which the
-- SELECT-policy-only approach here does not.
CREATE POLICY "Block direct reads of anonymous chats"
  ON public.chats
  AS RESTRICTIVE
  FOR SELECT
  USING (is_anonymous = false);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run against a real local Postgres instance seeded with the exact
-- table/policy DDL from `supabase db dump --linked` against the live
-- project, plus this migration, with two test users A/B in a shared
-- anonymous chat and a non-participant C. All of the following were
-- confirmed:
--
--   * chats_view / chat_messages_view: A sees A's own id/messages with
--     real user_id and B's nulled; B sees the symmetric opposite;
--     non-participant C gets zero rows; a reply-preview quote of B's
--     message also has its user_id nulled for A (and vice versa); a
--     non-anonymous chat's view rows are completely unredacted on both
--     sides, unchanged from today.
--   * Direct base-table SELECT of an anonymous chats/chat_messages row
--     returns zero rows for EVERYONE, including genuine participants —
--     confirmed both before and after adding is_chat_participant(), i.e.
--     the participant-check fix does not accidentally reopen this.
--   * A genuine participant's bare INSERT (no RETURNING) into an
--     anonymous chat succeeds. The identical INSERT with RETURNING, and
--     a base-table UPDATE (mark-as-read) or DELETE targeting an
--     anonymous chat's messages, all fail safely — zero rows
--     returned/affected, no error surfaced as bad data, no partial
--     writes — confirming Phase 4 needs dedicated RPCs for those rather
--     than silently corrupting or partially applying them.
--   * A non-participant's INSERT attempt into someone else's anonymous
--     chat fails outright (security not weakened by any of the above).
--   * Every non-anonymous-chat operation exercised (matchmaking-style
--     existing-chat lookup, Lost & Found-style lookup, send with
--     RETURNING, mark-as-read UPDATE, direct SELECT) behaves identically
--     to before this migration — zero regressions for non-anonymous
--     chats.
--   * An anon-role (unauthenticated) request against chats_view /
--     chat_messages_view is rejected outright (permission denied) before
--     even reaching the view's WHERE clause, via the REVOKE/GRANT pair on
--     each view — not merely relying on auth.uid() resolving to NULL.
--   * chat_messages_view's block filter: a message from someone I
--     blocked (profile_only) is excluded; a message from someone who
--     blocked ME (either scope on their end) is also excluded, matching
--     useBlocks.ts's coercion; a message from someone with only an
--     anonymous_only block I placed on them (not profile_only) is NOT
--     excluded, matching today's client-side behavior exactly;
--     non-anonymous chats' messages are filtered by the identical rule
--     (this is a new behavior for them — the view previously didn't
--     filter blocks at all — but it now matches what selectMessages
--     already filters client-side, so there is no user-visible
--     difference).
--   * A message in one chat with reply_to_id pointing at a message in a
--     completely unrelated chat does not leak that message's content —
--     reply_message is null unless the replied-to message belongs to the
--     same chat.
-- ============================================================
