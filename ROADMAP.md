# UniTee Roadmap

Living plan for UniTee. Updated in the same commit as any change related to an item:
check it off, add the commit hash, and move it to **Done** once it is pushed.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

_Last updated: 2026-09-24_

---

## 🐞 Bugs

- [~] **Chat images: stale notification, very slow load, full-screen viewer never loads.**
  Fix on branch `fix/chat-images-stale-push` — push age limit + skipped-as-handled (server), chat
  images compressed to 1080 px WebP, signed URLs cached by storage path and shared by the bubble +
  full-screen viewer, full-screen spinner/error/retry. Awaiting on-device check before merge.
  A push notification ("admin sent you an image") arrived for an image sent long ago;
  opening the chat took ~2 minutes to show the image, and the full-screen view never loaded.
  Root causes found (2026-09-24):
  - `send-push-notification` skips users with no push token / chat notifications off **without
    marking the notification handled**, so it stays queued (no age limit) and is pushed whenever
    the user next has a token.
  - Chat images are uploaded **uncompressed** (full camera resolution, up to 10 MB), unlike every
    other upload path (1080 px WebP).
  - Private-bucket signed URLs change on every sign, so expo-image's disk cache never hits across
    sessions, and the full-screen viewer signs its **own** URL, re-downloading the full original
    with no loading indicator.

## ✨ Features

- [ ] **Lost & Found → Announcements & Advertisements.** Transform the Lost & Found section
  into announcements and advertisements.
- [ ] **Community header layout.** Make the community avatar smaller so the description has
  room to display properly.
- [ ] **Optimistic commenting.** Show a new comment immediately, before the server confirms it.
- [~] **Chat: up to 3 images per message, shown like posts.** Single image keeps the whole-photo
  bubble, 2–3 show as the post preview strip; old app builds show only the first image until they
  update. Branch `feat/chat-multi-image` — migration `20260925000000` not applied yet.
- [~] **Swipeable images.** Swipe between pictures in full screen — chat and posts share one viewer.
  Branch `feat/chat-multi-image` (feed, post detail, communities, Lost & Found, create-post, chat).

## 🚀 Waiting on a store build

Committed and pushed, but only reaches users with the next App Store / Google Play release
(no over-the-air updates are configured).

- [ ] SDU branding shows "Suleiman Demirel" for `sdu.edu.kz` (`daf72ac`)
- [ ] Clear "This university is not supported yet." message at signup (`daf72ac`)
- [ ] Email-link screen tells verified users to sign in instead of showing an error (`a486933`)
- [ ] Vote taps no longer open the post detail (`bfd5b45`) — verify on real iOS + Android devices

## 🔭 Later

- [ ] **Upgrade Expo SDK 54 → 57.** Not urgent. Breaking changes to handle: expo-router drops
  react-navigation (3 files), `expo/fetch` becomes global `fetch`, iOS minimum 16.4.
- [ ] **Faster vote retries.** Taps during an in-flight vote are ignored for the whole save
  (network + 100 ms delay + refetches in `useVote`'s `onSettled`).

## ✅ Done

- [x] 2026-09-24 · SDU signup domain fixed (`sdu.edu.kz`) + working pre-signup domain check · `daf72ac`
- [x] 2026-09-24 · Email-link callback: clear messages for used/expired links and other-device opens · `a486933`
- [x] 2026-09-24 · Vote taps no longer fall through to the post card · `bfd5b45`
