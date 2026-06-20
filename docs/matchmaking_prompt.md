# Launch Week Matchmaking Feature — Cursor Implementation Brief

## 1. Your First Step: Plan Before You Code

**Before writing a single line of code**, do the following:
1. Scan the entire codebase thoroughly. Understand the folder structure, conventions, component patterns, hook patterns, and how Supabase is used.
2. Read `src/theme.ts` — all new UI must use these exact theme tokens.
3. Read `src/utils/scaling.ts` — all sizing must use `moderateScale`, `scale`, `verticalScale`. No raw pixel values.
4. Read `src/components/ReportModal.tsx` and `src/components/CustomInput.tsx` — these are your style references for modals and inputs respectively.
5. Read `src/app/(protected)/(tabs)/index.tsx` — this is where you will integrate the "Join Matchmaking" banner/button on the feed screen.
6. Read `src/features/profile/hooks/useMyProfile.ts` — understand how `university_id` is fetched; you will need it for all matchmaking queries.
7. Read `src/types/database.types.ts` — understand the existing DB schema before adding new types.
8. Write out your full implementation plan. List every file you will create or modify, what each file does, and in what order you will implement them. Do not proceed until the plan is complete.

## 2. Git Branch

Create and switch to a new branch before touching any code:
```
git checkout -b feature/launch-week-matchmaking
```

## 3. Feature Overview

UniTee is an anonymous social app for university students (React Native + Expo Router + Supabase). We are building a **"Launch Week" matchmaking event** — a 2-week FOMO campaign. Students fill out a personality/lifestyle questionnaire. On Day 14, submissions lock, and everyone receives a single "Perfect Match" from within their university.

Marketing copy is deliberately ambiguous ("Find your Perfect Match") — not explicitly a dating feature — to maximise participation across all student demographics.

---

## 4. Database Schema (Supabase / PostgreSQL)

Create a SQL migration file at `supabase/migrations/<timestamp>_launch_week_matchmaking.sql`.

### 4a. `launch_event_profiles` table

Stores each user's questionnaire submission. Demographic fields (`name`, `major`) are collected only for the matching reveal and **must be deleted** after the event ends (see Section 8 — Data Retention).

```sql
CREATE TABLE public.launch_event_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id   uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  gender          text NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  -- Demographic fields — temporary, deleted post-event (see retention policy)
  display_name    text NOT NULL,          -- first name only, shown on match reveal
  major           text NOT NULL,
  -- Questionnaire answers: each value is the 0-based index of the chosen option
  answers         jsonb NOT NULL,         -- { "q1": 2, "q2": 0, ... "q9": 3 }
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)                         -- one submission per user
);

-- Enforce campus isolation at the DB level
ALTER TABLE public.launch_event_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own profile"
  ON public.launch_event_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own profile"
ON public.launch_event_profiles FOR SELECT
USING (auth.uid() = user_id);

-- Admins can read all profiles (needed for running the algorithm)
CREATE POLICY "Admins can read all profiles"
  ON public.launch_event_profiles FOR SELECT
  USING (public.get_my_is_admin());
```

### 4b. `launch_event_matches` table

Populated by the matching algorithm (run server-side / via admin edge function). Each row is one mutual match pair — always (user_a, user_b) where user_a < user_b to avoid duplicate rows.

```sql
CREATE TABLE public.launch_event_matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       uuid NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  user_a_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  compatibility_score numeric(5,2) NOT NULL,
  match_type          text NOT NULL CHECK (match_type IN ('primary', 'wingman')),
  -- 'primary' = cross-gender match; 'wingman' = same-gender overflow match
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_a_id),
  UNIQUE(user_b_id),
  CHECK (user_a_id < user_b_id)          -- canonical ordering, no duplicate pairs
);

ALTER TABLE public.launch_event_matches ENABLE ROW LEVEL SECURITY;

-- A user can only see their own match row
CREATE POLICY "Users can read their own match"
  ON public.launch_event_matches FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Admins can manage matches"
  ON public.launch_event_matches FOR ALL
  USING (public.get_my_is_admin());
```

### 4c. `launch_event_message_windows` table

Tracks when a user first viewed their match. The 24-hour message window is enforced from `viewed_at`.

```sql
CREATE TABLE public.launch_event_message_windows (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id        uuid NOT NULL REFERENCES public.launch_event_matches(id) ON DELETE CASCADE,
  viewed_at       timestamptz NOT NULL DEFAULT now(),
  window_expires_at timestamptz NOT NULL GENERATED ALWAYS AS (viewed_at + interval '24 hours') STORED
);

ALTER TABLE public.launch_event_message_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own window"
  ON public.launch_event_message_windows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 4d. `launch_event_config` table (event state control)

A single-row config table that controls the event lifecycle. This lets us toggle phases without deploying code.

```sql
CREATE TABLE public.launch_event_config (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  phase           text NOT NULL CHECK (phase IN ('inactive', 'accepting', 'locked', 'revealed'))
  -- inactive   → button not shown
  -- accepting  → "Join Matchmaking" shown, form open
  -- locked     → submissions closed (Day 14), algorithm runs
  -- revealed   → "See Your Match" shown
);

INSERT INTO public.launch_event_config (phase) VALUES ('inactive');

ALTER TABLE public.launch_event_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read config"
  ON public.launch_event_config FOR SELECT USING (true);

CREATE POLICY "Admins can update config"
  ON public.launch_event_config FOR UPDATE USING (public.get_my_is_admin());
```

---

## 5. Questions Config — Editable, Versioned

Create `src/features/matchmaking/config/questions.ts`. This is the single source of truth for all questionnaire content. Changing, adding, or removing questions in this file should automatically update the entire UI without touching any component.

```typescript
export type QuestionOption = {
  label: string;
};

export type Question = {
  id: string;          // e.g. "q1" — must match keys in answers jsonb
  text: string;        // displayed to user
  options: QuestionOption[];  // exactly 4 options (multiple choice, single select)
  weight: number;      // 1 | 2 | 3 — used by compatibility scoring algorithm
  scoringType: 'similarity' | 'complementarity';
  // similarity: exact match = full weight, adjacent = half weight, opposite = 0
  // complementarity: opposite = full weight, adjacent = half weight, exact = 0
  adjacency?: number[][];
  // Optional: define which answer indices are "adjacent" to each other.
  // If omitted and scoringType is 'similarity', fallback: |a - b| determines adjacency.
};

export const MATCHMAKING_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: 'Your Friday night default?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Out — bars, parties, social scene' },
      { label: 'Small hangout, close friends only' },
      { label: 'Cozy night in, total decompress' },
      { label: 'Spontaneous — could go either way' },
    ],
  },
  {
    id: 'q2',
    text: 'Your natural sleep schedule?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Early bird — up before 8am' },
      { label: 'Midnight — sleep around 12am' },
      { label: 'Night owl — up past 2am regularly' },
      { label: 'Chaotic, no real schedule' },
    ],
  },
  {
    id: 'q3',
    text: 'Your texting style?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Reply fast, always on' },
      { label: 'Thoughtful, but slow' },
      { label: 'Call/voice > texts any day' },
      { label: 'Depends completely on who it is' },
    ],
  },
  {
    id: 'q4',
    text: 'When stressed, you…?',
    weight: 2,
    scoringType: 'complementarity',
    // complementarity: someone who decompresses alone pairs well with someone who stays busy
    options: [
      { label: 'Need solo time to reset' },
      { label: 'Vent to someone close' },
      { label: 'Stay busy, push through' },
      { label: 'Exercise or physical outlet' },
    ],
  },
  {
    id: 'q5',
    text: 'In 5 years, you see yourself…?',
    weight: 2,
    scoringType: 'similarity',
    options: [
      { label: 'Climbing the career ladder hard' },
      { label: 'Building something of my own' },
      { label: 'Doing meaningful work / impact' },
      { label: 'Honestly still figuring it out' },
    ],
  },
  {
    id: 'q6',
    text: 'What you value most in people?',
    weight: 2,
    scoringType: 'similarity',
    options: [
      { label: 'Loyalty — ride or die' },
      { label: 'Ambition — always building' },
      { label: 'Creativity — original thinker' },
      { label: 'Authenticity — no performance' },
    ],
  },
  {
    id: 'q7',
    text: 'Your humor flavor?',
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Self-deprecating' },
      { label: 'Dry / deadpan' },
      { label: 'Absurd and chaotic' },
      { label: 'Wholesome / dad jokes' },
    ],
  },
  {
    id: 'q8',
    text: 'When there\'s tension, you…?',
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Address it directly, right away' },
      { label: 'Let it cool, then talk' },
      { label: 'Drop hints and hope they get it' },
      { label: 'Pretend everything\'s fine' },
    ],
  },
  {
    id: 'q9',
    text: 'Ideal way to spend time together?',
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Explore somewhere new' },
      { label: 'Cook / eat together' },
      { label: 'Coffee and deep conversation' },
      { label: 'Drinks, music, and good vibes' },
    ],
  },
];

export const MAX_COMPATIBILITY_SCORE = MATCHMAKING_QUESTIONS.reduce(
  (sum, q) => sum + q.weight,
  0,
); // = 18
```

---

## 6. Feature File Structure

Create all new files under `src/features/matchmaking/`. Mirror the existing feature folder conventions (data/, hooks/, components/, types.ts).

```
src/features/matchmaking/
  config/
    questions.ts              ← single source of truth for questions (Section 5)
  types.ts                    ← TypeScript types for all matchmaking entities
  data/
    queries.ts                ← all Supabase queries (event config, submission, match fetch)
  hooks/
    useEventConfig.ts         ← fetches launch_event_config, exposes current phase
    useMySubmission.ts        ← checks if current user has already submitted
    useSubmitMatchmaking.ts   ← mutation: inserts into launch_event_profiles
    useMyMatch.ts             ← fetches the user's match row + match partner's demographic info
    useRecordMatchView.ts     ← mutation: upserts launch_event_message_windows on first view
    useMatchWindowStatus.ts   ← derives window_expires_at, expired boolean, time remaining
  components/
    MatchmakingBanner.tsx     ← inline banner shown on feed (phase: accepting | revealed)
    MatchmakingFormModal.tsx  ← full-screen modal: step 1 = demographics, step 2+ = questions
    QuestionCard.tsx          ← single question with 4 option chips (used inside FormModal)
    MatchRevealModal.tsx      ← match reveal modal shown when user taps "See Your Match"
```

---

## 7. Component Behaviour Specs

### 7a. `MatchmakingBanner` (shown on feed screen)
- Rendered at the **top of the feed**, below the `CommunityFilterBar` in `src/app/(protected)/(tabs)/index.tsx`.
- **Phase `accepting`:** Shows "✨ Find Your Perfect Match — Join Now" with a CTA button. Tapping opens `MatchmakingFormModal`.
- **Phase `accepting` + user already submitted:** Banner is hidden entirely.
- **Phase `revealed`:** Shows "Your match is ready — See Your Match 🔥" with a CTA button. Tapping opens `MatchRevealModal`.
- **Phase `revealed` + user's 24h window expired:** Banner is hidden entirely.
- **Phase `inactive` or `locked`:** Banner is hidden entirely.
- Style: card with `theme.primary` accent, rounded corners (`moderateScale(12)`), consistent padding using `scale`/`verticalScale`. Subtle shadow. Dismissable? No — it stays until action is taken or window expires.

### 7b. `MatchmakingFormModal`
- Full-screen modal (`animationType="slide"`, presented from bottom).
- **Step 1 — Demographics** (separate screen within modal):
  - Text input: First name only (`display_name`)
  - Text input: Major
  - Radio/chip selector: Gender (`male` / `female` / `other`)
  - "Continue →" button — disabled until all fields filled
- **Steps 2–10 — Questions** (one question per screen, swipe/button forward):
  - Shows current question text at top
  - Four option chips below — tapping selects (highlighted in `theme.primary`), tapping again does not deselect (force a choice)
  - Progress indicator (e.g. "3 / 9") at top
  - "Back" and "Next" navigation buttons
  - "Next" disabled until an option is selected for current question
- **Final Step — Confirm**:
  - Summary: "You're all set! Results drop in X days." (compute from config or hardcode Day 14 date)
  - "Confirm & Submit" button — calls `useSubmitMatchmaking`, shows loading state
  - On success: close modal. `useMySubmission` cache is invalidated so banner disappears.
- On any back-navigation past step 1, ask for confirmation before discarding (standard `Alert.alert`).
- Keyboard avoidance: `KeyboardAvoidingView` with `behavior="padding"` on iOS.

### 7c. `QuestionCard`
- Props: `question: Question`, `selectedOption: number | null`, `onSelect: (index: number) => void`
- Renders question text + 4 pressable option chips
- Selected chip: `backgroundColor: theme.primary`, text white
- Unselected chip: `backgroundColor: theme.card`, border `theme.border`
- Chips should be full-width stacked, not grid (easier to tap on mobile)

### 7d. `MatchRevealModal`
- Full-screen modal, `animationType="fade"`.
- On mount: calls `useRecordMatchView` to stamp `viewed_at` (only if not already stamped).
- Shows:
  - Match's `display_name` and `major`
  - Match type copy: if `match_type === 'primary'` → "Your Perfect Match"; if `wingman` → "Your Ultimate Wingman"
  - Compatibility score displayed as a percentage: `(score / 18) * 100`%
  - "Send Message" button → calls existing chat initiation logic (`useInitiateAnonymousChat` — check `src/features/chat/hooks/useInitiateAnonymousChat.ts` and use it directly)
  - Countdown timer showing remaining time in the 24h window (live, updates every second)
  - "Close" button (top-right X or bottom dismiss)
- After window expires: if modal is reopened, show "Your window has closed" state instead of match info + Send Message button.

---

## 8. Data Retention — Demographic Purge

After the event ends (admin sets phase to `revealed` and after some reasonable post-event grace period), demographic data must be erasable. Implement a Supabase Edge Function at `supabase/functions/purge-matchmaking-demographics/index.ts`:

- Callable only by an authenticated admin (check `get_my_is_admin()`).
- Runs: `UPDATE public.launch_event_profiles SET display_name = '[removed]', major = '[removed]'`
- Does NOT delete the `answers` rows (they may be needed for post-event analytics).
- Does NOT delete `launch_event_matches` rows (match pairings are permanent for the event).
- Returns count of rows purged.

Also add a `launch_event_profiles.demographics_purged_at` column (nullable `timestamptz`) that this function sets, so you can confirm purge happened.

---

## 9. Matching Algorithm (Server-Side Edge Function)

Create `supabase/functions/run-matchmaking/index.ts`. This is called by an admin after phase is set to `locked`.

### Algorithm:

1. Fetch all `launch_event_profiles` rows grouped by `university_id`.
2. For each university, separate participants into `male`/`female`/`other` pools.
3. **Primary matching (cross-gender):** Run a score-based **Hungarian algorithm** (optimal assignment) on the male × female compatibility matrix.
   - Compatibility score between user A and user B = sum over all questions of: `computeQuestionScore(q, answerA, answerB)` where `computeQuestionScore` respects `scoringType` and `weight` from `questions.ts` (copy or import the config).
4. **Overflow matching (same-gender):** After primary matching, collect unmatched users (from ratio imbalance + all `other` gender users). Run the same Hungarian algorithm within each leftover pool. Set `match_type = 'wingman'`.
5. Write results to `launch_event_matches`. Use canonical ordering: `user_a_id < user_b_id`.
6. Return summary: `{ university_id, primary_matches, wingman_matches, unmatched }[]`.

### Score function (implement in the edge function):

```typescript
function computeQuestionScore(q: Question, a: number, b: number): number {
  if (q.scoringType === 'similarity') {
    if (a === b) return q.weight;
    // adjacency: |a - b| === 1 counts as adjacent for ordered questions
    if (Math.abs(a - b) === 1) return q.weight / 2;
    return 0;
  }
  if (q.scoringType === 'complementarity') {
    const maxDiff = q.options.length - 1;
    const diff = Math.abs(a - b);
    if (diff === maxDiff) return q.weight;       // maximally different = full score
    if (diff >= maxDiff / 2) return q.weight / 2;
    return 0;
  }
  return 0;
}
```

---

## 10. TypeScript Types

Create `src/features/matchmaking/types.ts`:

```typescript
export type EventPhase = 'inactive' | 'accepting' | 'locked' | 'revealed';

export type LaunchEventProfile = {
  id: string;
  user_id: string;
  university_id: string;
  gender: 'male' | 'female' | 'other';
  display_name: string;
  major: string;
  answers: Record<string, number>;  // { q1: 2, q2: 0, ... }
  submitted_at: string;
};

export type LaunchEventMatch = {
  id: string;
  university_id: string;
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number;
  match_type: 'primary' | 'wingman';
  created_at: string;
};

export type MatchWindowStatus = {
  viewed_at: string | null;
  window_expires_at: string | null;
  isExpired: boolean;
  msRemaining: number;
};

// What the reveal modal needs — fetched in a joined query
export type MatchWithPartnerInfo = LaunchEventMatch & {
  partner: {
    display_name: string;
    major: string;
    gender: 'male' | 'female' | 'other';
  };
};
```

---

## 11. Existing App Conventions — Must Follow

- **Fonts:** `Poppins_400Regular`, `Poppins_500Medium`, `Poppins_600SemiBold` — use these for all text.
- **Scaling:** All sizes via `moderateScale()`, `scale()`, `verticalScale()` from `src/utils/scaling.ts`. No raw numbers for layout.
- **Theme:** All colors from `useTheme()` → `theme.*`. No hardcoded hex values except the error red `#EF4444` which is established in the theme.
- **Supabase client:** Import from `src/lib/supabase.ts` — `import { supabase } from '../../../lib/supabase'`.
- **Data fetching:** `@tanstack/react-query` — `useQuery` for reads, `useMutation` for writes. Follow the same query key naming convention: `['matchmaking', 'config']`, `['matchmaking', 'my-submission', userId]`, `['matchmaking', 'my-match', userId]`.
- **Icons:** `@expo/vector-icons` (Feather, Ionicons, MaterialCommunityIcons) — check existing components to see which icon sets are already used.
- **No raw `fetch`** calls — always use the `supabase` client.
- **RLS is the security layer** — never filter by university_id on the client side expecting it to be the only guard; the DB policies enforce it.
- **Modals:** Pattern from `ReportModal.tsx` — `Modal` with `transparent`, `animationType`, `KeyboardAvoidingView`, outer `Pressable` overlay closes modal, inner `Pressable` stops propagation.

---

## 12. What NOT to Do

- Do not modify `public.profiles` — all matchmaking data lives in the new tables.
- Do not store gender permanently — it is only in `launch_event_profiles` and gets purged.
- Do not allow a user to submit more than once (enforced by `UNIQUE(user_id)` constraint + check in `useMySubmission` hook before showing the form).
- Do not cross-match users from different universities — `university_id` is on every table and all queries must filter by it.
- Do not run the algorithm client-side — it runs in the Edge Function only.
- Do not add the `MatchmakingBanner` to any screen other than the main feed (`src/app/(protected)/(tabs)/index.tsx`).
- Do not hardcode the event phase — always read from `launch_event_config`.

---

## 13. Definition of Done

- [ ] Migration SQL file created and correct
- [ ] `questions.ts` config file — all 9 questions, weights, scoring types
- [ ] All hooks implemented with correct React Query setup
- [ ] `MatchmakingBanner` renders correctly for all phases and hides correctly
- [ ] `MatchmakingFormModal` — step 1 demographics + step 2-10 questions + confirm step all functional
- [ ] `MatchRevealModal` — shows match info, countdown timer, send message button, expired state
- [ ] Edge function `run-matchmaking` implemented (Hungarian algorithm)
- [ ] Edge function `purge-matchmaking-demographics` implemented
- [ ] All new code is TypeScript strict — no `any` unless absolutely unavoidable
- [ ] All new UI matches the existing app's visual style (theme tokens, fonts, scaling)
- [ ] Everything lives on `feature/launch-week-matchmaking` branch