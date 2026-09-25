# UniTee Roadmap

Living plan for UniTee. Updated in the same commit as any change related to an item:
check it off, add the commit hash, and move it to **Done** once it is pushed.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

_Last updated: 2026-09-25_

---

## 🐞 Bugs

_No open bugs._

## ✨ Features

- [ ] **Lost & Found → Announcements & Advertisements.** Transform the Lost & Found section
  into announcements and advertisements.

## 🚀 Waiting on a store build

Committed and pushed, but only reaches users with the next App Store / Google Play release
(no over-the-air updates are configured). **Everything below ships in 1.2.0** (version bumped
2026-09-25; 1.1.0 is live). Check these off once 1.2.0 is released.

- [ ] SDU branding shows "Suleiman Demirel" for `sdu.edu.kz` (`daf72ac`)
- [ ] Clear "This university is not supported yet." message at signup (`daf72ac`)
- [ ] Email-link screen tells verified users to sign in instead of showing an error (`a486933`)
- [ ] Vote taps no longer open the post detail (`bfd5b45`) — verify on real iOS + Android devices
- [ ] Chat images compressed + cached by path, full-screen loading/error state (`04e24d7`)
- [ ] Chat: up to 3 images per message as rounded post-style tiles (`2e2c34c`, `d454f02`, `c9ed6cb`)
- [ ] Swipeable full-screen gallery for chat and posts (`2e2c34c`)
- [ ] Optimistic commenting: comments appear instantly while moderation runs (`2c8be1e`)
- [ ] Tab lists no longer blank / stuck "dragged down" after background updates (`ccb4133`, `15b5d5c`)
- [ ] Community header: avatar + name on one row, full-width description (`af20799`)

## 🔭 Later

- [ ] **Upgrade Expo SDK 54 → 57.** Not urgent. Breaking changes to handle: expo-router drops
  react-navigation (3 files), `expo/fetch` becomes global `fetch`, iOS minimum 16.4.
- [ ] **Faster vote retries.** Taps during an in-flight vote are ignored for the whole save
  (network + 100 ms delay + refetches in `useVote`'s `onSettled`).
- [ ] **Security advisor clean-up (pre-existing, found 2026-09-24).** 6 `SECURITY DEFINER` RPCs are
  still executable by `anon` (`set_chat_message_deletion`, `is_chat_participant`,
  `can_read_chat_message_directly`, `generate_random_username`, `is_anonymous_chat_post_blocked`,
  `is_anonymous_chat_relationship_blocked`) — review each and revoke EXECUTE from `anon`
  (`is_supported_university_domain` is intentionally public). Also 2 functions without a fixed
  `search_path` (`assign_founding_member`, `is_valid_username`).

## ✅ Done

- [x] 2026-09-24 · SDU signup domain fixed (`sdu.edu.kz`) + working pre-signup domain check · `daf72ac`
- [x] 2026-09-24 · Email-link callback: clear messages for used/expired links and other-device opens · `a486933`
- [x] 2026-09-24 · Vote taps no longer fall through to the post card · `bfd5b45`
- [x] 2026-09-24 · Stale push notifications stopped (1-hour cutoff, skipped users marked handled) — deployed · `fe7f927`
- [x] 2026-09-24 · Chat images: compressed uploads, path-based caching, full-screen spinner/error/retry · `04e24d7`
- [x] 2026-09-25 · Chat: up to 3 images per message (migration `20260925000000` live) + swipeable full-screen gallery for chat and posts · `2e2c34c`, `d454f02`, `c9ed6cb`
- [x] 2026-09-25 · Optimistic commenting + `create-comment` runs both AI checks in parallel (deployed) · `2c8be1e`
- [x] 2026-09-25 · Profile/Lost & Found/Chats lists: no blank list or stuck pull-to-refresh after background updates · `ccb4133`, `15b5d5c`
- [x] 2026-09-25 · Community header: avatar + name on one row, full-width description · `af20799`
