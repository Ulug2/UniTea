# UniTee Roadmap

Living plan for UniTee. Updated in the same commit as any change related to an item:
check it off, add the commit hash, and move it to **Done** once it is pushed.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

_Last updated: 2026-10-03_

---

## 🐞 Bugs

_No open bugs._

## ✨ Features

_No open features._

## 🚀 Waiting on a store build

Committed and pushed, but only reaches users with the next App Store / Google Play release
(no over-the-air updates are configured). **Everything below ships in 1.2.0** (version bumped
2026-09-25; 1.1.0 is live). Check these off once 1.2.0 is released.

- [x] Signup: "Too many attempts" lock now expires, real wait time shown, clear message for breached/common passwords (`345b4fb`) — after release, re-enable Supabase leaked-password protection (turned off 2026-09-29)
- [x] SDU branding shows "Suleiman Demirel" for `sdu.edu.kz` (`daf72ac`)
- [x] Clear "This university is not supported yet." message at signup (`daf72ac`)
- [x] Email-link screen tells verified users to sign in instead of showing an error (`a486933`)
- [x] Vote taps no longer open the post detail (`bfd5b45`) — verify on real iOS + Android devices
- [x] Chat images compressed + cached by path, full-screen loading/error state (`04e24d7`)
- [x] Chat: up to 3 images per message as rounded post-style tiles (`2e2c34c`, `d454f02`, `c9ed6cb`)
- [x] Swipeable full-screen gallery for chat and posts (`2e2c34c`)
- [x] Optimistic commenting: comments appear instantly while the comment is saved (`2c8be1e`)
- [x] Tab lists no longer blank / stuck "dragged down" after background updates (`ccb4133`, `15b5d5c`)
- [x] Community header: avatar + name on one row, full-width description (`af20799`)

Committed after the 1.2.0 list above was checked off — ships in whichever build is cut next:

- [ ] Auth email placeholder reads `you@university.edu` (`09526aa`)
- [ ] Settings: Website (unitea.app) and Instagram (`unitee.ig`) links (`09526aa`)
- [ ] Settings: Dark Mode row says "Following system appearance" instead of naming iPhone on Android (`09526aa`)
- [ ] Copy post and comment text on detail screens: press-and-select on Android, long-press → Copy (whole text) on iOS (`6f8e744`) — verify on real iOS + Android devices
- [ ] Market tab: Lost & Found tab renamed "Market" with Market (for sale, optional ₸ price, Chat) and Lost & Found segments, with its own safety reminder on selling posts (`521c05d`, `ebddb29`) — server side already live; verify segments, price field and ₸ sign on real iOS + Android devices
- [x] Chat shows which post a conversation is about: opening a chat from a post (feed, anonymous, Lost & Found, Market) attaches it to the next message as a tappable preview; images shown as `[image]` (`9511d22`) — test on real iOS + Android devices before release
- [x] Market tab: images no longer flash white when switching between Market and Lost & Found; both lists stay mounted, so scroll position and search text are kept (`0c9746f`) — verify on real iOS + Android devices

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

- [x] 2026-09-29 · Signup rush: raised Supabase email cap to 1000/h; auth rate-limit lockout + weak-password message fixed in app · `345b4fb`
- [x] 2026-09-29 · Website user count (unitea.app) counts email-verified students only — deployed · `e2f07d2`
- [x] 2026-09-24 · SDU signup domain fixed (`sdu.edu.kz`) + working pre-signup domain check · `daf72ac`
- [x] 2026-09-24 · Email-link callback: clear messages for used/expired links and other-device opens · `a486933`
- [x] 2026-09-24 · Vote taps no longer fall through to the post card · `bfd5b45`
- [x] 2026-09-24 · Stale push notifications stopped (1-hour cutoff, skipped users marked handled) — deployed · `fe7f927`
- [x] 2026-09-24 · Chat images: compressed uploads, path-based caching, full-screen spinner/error/retry · `04e24d7`
- [x] 2026-09-25 · Chat: up to 3 images per message (migration `20260925000000` live) + swipeable full-screen gallery for chat and posts · `2e2c34c`, `d454f02`, `c9ed6cb`
- [x] 2026-09-25 · Optimistic commenting + `create-comment` runs both AI checks in parallel (deployed) · `2c8be1e`
- [x] 2026-09-25 · Profile/Lost & Found/Chats lists: no blank list or stuck pull-to-refresh after background updates · `ccb4133`, `15b5d5c`
- [x] 2026-09-25 · Community header: avatar + name on one row, full-width description · `af20799`
- [x] 2026-09-29 · AI moderation allows names unless the content targets a private person (insults, threats, sexual comments, rumors, personal info); public figures can be criticized freely — deployed (server-side, all app versions) · `0c34450`
- [x] 2026-10-03 · Auth email placeholder `you@university.edu`; Website + Instagram links in Settings; Dark Mode label no longer says "iPhone" on Android · `09526aa`
- [x] 2026-10-03 · Post, comment and Lost & Found detail text can be copied (selectable on detail screens only, so feed taps still open the post) · `6f8e744`
- [x] 2026-10-03 · Market tab (sell items next to Lost & Found): migration `20261003000000` + `create-post` deployed (additive, old builds unaffected); app side waits for a store build · `521c05d`
- [x] 2026-10-08 · AI moderation removed from comments and community creation (name + description); posts and post images stay AI-moderated — `create-comment`, `create-community`, `create-post` deployed (server-side, all app versions) · `8c1171c`
- [x] 2026-10-08 · Chat post preview: migration `20261008000000` deployed (additive, old builds unaffected); app side waits for a store build · `9511d22`
- [x] 2026-10-08 · Market tab: no white image flash when switching Market ↔ Lost & Found (client-side, waits for a store build) · `0c9746f`
