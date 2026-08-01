# Dummy Auth Screens (Login + Signup) — Design

## Context

A3 (Booking) is the first module to work on in the final-phase plan since ITD credentials aren't available yet (A2 — Identity & Access, which needs real OTP + ITD `add_customer` — is blocked on them). Booking already gates behind `isLoggedIn` (`Home.tsx`, `CreateShipment.tsx` redirect to `/login?redirect=/create`), so before booking work can be exercised end-to-end there needs to be *some* way to log in.

This spec covers replacing the two existing auth screens with client-only, no-backend scaffolding: enough to get a session into the store and reach the booking flow, without building real OTP delivery or persistence. It intentionally throws away work when A2 lands for real (SMS provider, Aadhaar/GST capture, personal vs company signup, ITD `add_customer`) — this is scaffolding, not the final A2 implementation.

**Current state:**
- `client/src/pages/Login.tsx` — email + password form, calls real `POST /api/auth/login` via `apiRequest`, expects a JSON `AuthUser` back.
- `client/src/pages/Signup.tsx` — static page telling users to email/WhatsApp Bombino for manual KYC-based account creation (today's actual onboarding process).
- `client/src/lib/store.ts` — `AuthUser` interface (`id`, `customerId`, `code`, `email`, `fullName`, `username`, `role`) and `login(user)` / `logout()` actions on the zustand store, persisted to localStorage under `bombino-storage`. Unchanged by this work.
- Booking gate: `Home.tsx:738` and `CreateShipment.tsx` redirect unauthenticated users to `/login?redirect=/create`; `Login.tsx` already reads `?redirect=` and forwards there after login.
- `AuthUser` has no phone field, and `CreateShipment.tsx`'s `senderPhone` field already always starts blank regardless of login state (`useState('')`, no prefill) — so phone does not need to round-trip through the auth object.

## Goal

Two screens, no backend calls, no new persistence:
- `/login` — returning user, phone number + OTP only.
- `/signup` — new user, First Name / Last Name / Email / Phone Number + OTP.

OTP is fully dummy: any 4–6 digit input is accepted, nothing is sent or verified server-side.

## Data flow

Both screens locally construct an `AuthUser` (existing type, no changes) and call the existing `login(user)` store action — the same mechanism `Login.tsx` already uses today after a real API call, just without the API call.

```ts
{
  id: `local-${Date.now()}`,
  customerId: `local-${Date.now()}`,
  code: `local-${Date.now()}`,
  email: <from form, or '' on Login>,
  fullName: <from form, or 'Customer <last4ofPhone>' on Login>,
  username: <phone>,
  role: 'customer',
}
```

No changes to `store.ts`, `App.tsx` routes, or any server code. `/login` and `/signup` already route to these files.

## Login.tsx

Replaces the email+password form entirely.

- **Step 1 — phone:** single phone number input, validated as 10 digits (reuse the `^\d{10}$` pattern already used in `CreateShipment.tsx`). "Send OTP" button advances to step 2 (no real send).
- **Step 2 — OTP:** OTP input, accepts any 4–6 digit value. "Verify & Sign In" builds the dummy `AuthUser` (email `''`, fullName `Customer <last4ofPhone>`) and calls `login(user)`. Back link returns to step 1. "Resend OTP" link with a simple 30s client-side cooldown (`setTimeout`/`useState`, no real resend) for realism.
- **On success:** redirect to `?redirect=` query param if present, else `/home` — same logic as current `Login.tsx`.
- **Bottom link:** "New here? Create account" → `/signup`, forwarding `?redirect=` if present so a new user who hit the booking gate still lands back on `/create` after signing up.
- Visual style unchanged from current `Login.tsx`: white rounded-2xl card, `#F3F4F6` input backgrounds, `#F2A123` primary button, Bombino logo header, `min-h-[100dvh]` + safe-area classes, same `data-testid` naming convention (`input-*`, `button-*`).

## Signup.tsx

Replaces the static "email/WhatsApp us" page entirely.

- **Step 1 — details:** First Name, Last Name, Email, Phone Number — all required, single screen. Phone validated as 10 digits; email validated as a basic email pattern. "Send OTP" advances to step 2.
- **Step 2 — OTP:** same as Login's OTP step (any 4–6 digits, "Verify & Create Account", back link, 30s resend cooldown).
- **On success:** builds dummy `AuthUser` with `fullName: `${firstName} ${lastName}`.trim()`, real `email`, `username: phone`, calls `login(user)`, redirects via `?redirect=` or `/home`.
- **Bottom link:** "Already have an account? Sign in" → `/login`.
- Same visual style as Login for consistency.

## Explicitly not shared

Login and Signup each implement their own phone+OTP step rather than a shared component/hook. They will diverge further when real A2 lands (OTP provider, Aadhaar/GST capture, personal-vs-company branching) — sharing now would add coupling that has to be unwound later for no current benefit.

## Out of scope

- Real OTP delivery/verification (SMS provider — blocked, part of A2)
- Any backend route or persistence (`/api/auth/*` untouched)
- Aadhaar/GST capture, personal vs company signup distinction
- ITD `add_customer` call
- Password-based login (removed, not replaced)

## Verification

- `npm run check` — TypeScript passes, no `any`.
- Manual click-through:
  1. From Home, tap a booking action while logged out → redirected to `/login?redirect=/create` → enter phone → "Send OTP" → enter any OTP → "Verify & Sign In" → lands on `/create`, logged in.
  2. Fresh session → `/signup` → fill First/Last/Email/Phone → "Send OTP" → any OTP → "Verify & Create Account" → lands on `/home`, name visible in header/profile.
  3. Cross-links: `/login` → "Create account" → `/signup`, and back, both preserving `?redirect=` when present.
  4. Resend cooldown visibly counts down and re-enables after 30s on both screens.
