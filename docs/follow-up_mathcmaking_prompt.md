# Launch Week Matchmaking — Follow-Up Clarifications

This is a follow-up to the original `matchmaking_prompt.md`. Apply these clarifications on top of the existing implementation plan.

---

## Clarification 1: Who Can Participate?

**Every registered user can join — no restriction to new users.**
**Each university should have seperate pools of users, users with different university_id should not be able to match each other**

Any user who has a valid account and `university_id` on `public.profiles` can submit a matchmaking entry. There is no sign-up date cutoff, no `is_founding_member` gate, no flag on `profiles`. If you have an account when the event is in phase `accepting`, you can participate.

---

## Clarification 2: Button Visibility Logic

The `MatchmakingBanner` (on the main feed) must follow this exact state machine, driven entirely by Supabase — zero app updates required:

| `launch_event_config.phase` | User has submitted? | Window expired? | What the banner shows |
|-----------------------------|--------------------|-----------------|-----------------------|
| `inactive`                  | —                  | —               | **Hidden**            |
| `accepting`                 | No                 | —               | **"Join Matchmaking"** button |
| `accepting`                 | Yes                | —               | **Hidden** (they already submitted) |
| `locked`                    | —                  | —               | **Hidden** (submissions closed, results not out yet) |
| `revealed`                  | Yes                | No              | **"See Your Match"** button |
| `revealed`                  | Yes                | Yes             | **Hidden** (24h window expired) |
| `revealed`                  | No                 | —               | **Hidden** (didn't participate) |

The full flow from the user's perspective:
1. User opens app → sees "Join Matchmaking" banner → taps → fills form → submits → banner disappears immediately.
2. Day 14: you (admin) flip `phase` to `revealed` in Supabase dashboard (or via admin panel). No app update. No push notification needed — next time any participating user opens the app, they see the "See Your Match" banner.
3. User taps "See Your Match" → reveal modal opens → 24h window starts → banner stays until window expires, then disappears permanently.

---

## Clarification 3: Everything Controlled via Supabase

The `launch_event_config` table (single row, `id = 1`) is the **only switch you need to touch** to control the entire event lifecycle. Changing `phase` in the Supabase dashboard (Table Editor or SQL editor) is sufficient — no app release, no env var change, no deploy.

To announce results:
```sql
UPDATE public.launch_event_config SET phase = 'revealed' WHERE id = 1;
```

To open submissions:
```sql
UPDATE public.launch_event_config SET phase = 'accepting' WHERE id = 1;
```

To lock submissions (before running the algorithm):
```sql
UPDATE public.launch_event_config SET phase = 'locked' WHERE id = 1;
```

Make sure `useEventConfig` hook polls or uses Supabase Realtime to pick up phase changes without requiring an app restart. Recommended approach: `useQuery` with a `staleTime` of 60 seconds (so it refetches on app foreground) + subscribe to realtime changes on `launch_event_config` to push the update instantly when phase changes.

---

## Implementation Notes (changes from original spec)

- Remove any code that restricts participation based on account age, `is_founding_member`, or any other user attribute. The only eligibility check is: authenticated + has a `university_id`.
- The `useMySubmission` hook result is what hides the "Join Matchmaking" button — if a row exists in `launch_event_profiles` for the current `user_id`, the button is gone.
- The `useMatchWindowStatus` hook result is what hides the "See Your Match" button — if `window_expires_at` is in the past, the button is gone.
- Both checks happen client-side using data fetched from Supabase, so they stay accurate across sessions.