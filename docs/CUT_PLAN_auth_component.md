## Cut Plan: `src/components/Auth.tsx` (Auth UI + flows)

### Why this file needs a cut
- **SRP violation**: one component owns UI rendering, input validation, error normalization, rate limiting, splash screen management, Supabase auth calls (login/signup/forgot/resend), and external link handling.
- **TypeScript hygiene**: repeated `any` in error handling and `details?: any` in analytics helper.
- **Embedded config**: Notion URLs are hardcoded in the component.

### Goals (definition of done)
- Keep `Auth.tsx` as a **presentational container** that composes:
  - `AuthForm` (UI)
  - `useAuthFlow` (business logic)
  - `authErrors.ts` (error normalization)
  - `links.ts` (terms/privacy URLs)
- No `any` in new code. Errors should be `unknown` and narrowed.
- Preserve UX: rate limiting, resend verification option, mode switching, and splash timing.

---

## Current responsibilities → extraction targets

### A) Design tokens/constants
- **Current**: SPACING/FONT_SIZES/BORDER_RADIUS/AUTH_CONFIG already centralized at top (good).
- **Keep**: either keep in `Auth.tsx` or extract to:
  - `src/features/auth/ui/tokens.ts`
  - `src/features/auth/config.ts` (for AUTH_CONFIG)

### B) External links (Terms/Privacy)
- **Current**: `TERMS_URL` / `PRIVACY_URL` hardcoded in component and used in multiple places.
- **Extract**:
  - `src/config/links.ts` exporting `TERMS_URL` and `PRIVACY_URL`
  - `openExternalLink(url)` util in `src/utils/links.ts` (used by profile too)

### C) Error normalization + rate limiting
- **Current**: `getUserFriendlyError(error: any)` mutates component state (sets rateLimitUntil, showResendOption).
- **Extract**:
  - `src/features/auth/errors.ts`
    - `normalizeAuthError(err: unknown): { message: string; kind: "rate_limit" | "email_not_confirmed" | "invalid_credentials" | ... }`
  - `useRateLimit({ cooldownMs })` hook:
    - owns `rateLimitUntil`, `checkRateLimit()`, `triggerRateLimit()`
  - The UI layer reacts to `kind` (e.g. show resend option) instead of the error normalizer mutating state.

### D) Auth operations (login/signup/forgot/resend)
- **Current**: each flow is implemented inline with duplicated patterns:
  - sanitize input
  - check rate limit
  - set loading state flags
  - `withTimeout(...)`
  - call supabase
  - show alerts
  - log breadcrumbs
- **Extract**:
  - `useAuthFlow()` hook returning:
    - `mode`, `setMode`
    - `email`, `password`, setters
    - `privacyAccepted`, `setPrivacyAccepted`
    - `submit()` (login or signup depending on mode)
    - `sendResetEmail()`
    - `resendVerificationEmail()`
    - `loading` + per-action loading flags
    - `errors` object for field validation
  - Data functions:
    - `authLogin(email, password)`
    - `authSignup(email, password)`
    - `authResetPassword(email)`
    - `authResendVerification(email)`

### E) Timeout handling
- **Current**: `withTimeout` sets `timeoutRef.current` but can be called multiple times.
- **Extract**:
  - `useTimeoutRace()` hook:
    - `race(promise, ms)`
    - guarantees cleanup on unmount
  - Or a shared util `src/utils/withTimeout.ts` plus a `useEffect` cleanup in hook.

### F) Splash screen integration
- **Current**: Auth screen shows splash during login/signup and hides after.
- **Extract**:
  - Keep UI-side but isolate:
    - `useSplashDuring(asyncAction)` helper that wraps `SplashScreen.preventAutoHideAsync()` and `hideSplashSafe()`.

### G) Rendering split
- **Extract components**:
  - `AuthHeader`
  - `AuthModeSwitcher`
  - `AuthInputs` (email/password, show password)
  - `PrivacyCheckboxRow`
  - `AuthPrimaryButton`
  - `ResendVerificationRow`

---

## Proposed target structure

```text
src/features/auth/
  components/
    AuthForm.tsx
    AuthHeader.tsx
    AuthInputs.tsx
    PrivacyRow.tsx
    ResendVerificationRow.tsx
  hooks/
    useAuthFlow.ts
    useRateLimit.ts
    useTimeoutRace.ts
    useSplashDuring.ts
  errors.ts
  config.ts
src/config/links.ts
src/utils/links.ts
```

---

## Cut sequence (safe, incremental)

### Cut 1: Extract shared links + link opener
- Move Notion URLs to `src/config/links.ts`.
- Move `openExternalLink` to `src/utils/links.ts` (typed error as `unknown`).

### Cut 2: Extract error normalization (pure)
- Create `normalizeAuthError(err: unknown)` returning `{ message, kind }`.
- Update UI to react to `kind` (rate limit, email not confirmed → show resend).

### Cut 3: Extract rate limit + timeout helpers
- `useRateLimit` and `useTimeoutRace` hooks.
- Replace inlined `rateLimitUntil` and `withTimeout`.

### Cut 4: Extract auth flow hook
- `useAuthFlow` owns state + flow functions, returns a simple interface to UI.
- `Auth.tsx` becomes a wrapper rendering `AuthForm`.

### Cut 5: Split UI into components
- Move chunks of JSX into `AuthForm` and subcomponents.

---

## Risks / test checklist
- Resend verification path appears only when appropriate and resets when switching modes.
- Rate limit: cooldown time is enforced consistently across login/signup/forgot/resend.
- Timeout cleanup: no setState after unmount.
- Splash: never gets stuck showing; always hides on success and error.

