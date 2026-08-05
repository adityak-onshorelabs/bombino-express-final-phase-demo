# Bombino Express — UX Strategy

Audit of the live app (16 routes, ~10k lines of page code), taken after the
auth flow was rebuilt. This document is the *why*; the sequencing plan at the
end is the *what*.

## The core problem

The app is not badly designed screen by screen. It is **three different
products wearing one logo**, and the seams are what read as "haywired".

| Surface | Language |
|---|---|
| `/home` | Marketing landing page — hero stats, "Why Bombino?", soft cards |
| `/rates`, `/create`, `/orders` | Generic app forms — rounded cards, navy buttons |
| `/login`, `/signup` | Freight Document — mono labels, hairlines, amber CTA |

A customer moving between them is asked to relearn the interface each time.

## Findings, ordered by damage

### 1. The primary action has no consistent colour — worst offender

The same action is different colours on different screens:

| Screen | "Login" button |
|---|---|
| `/home` | navy pill |
| `/orders` | navy |
| `/create` | **amber** |
| `/login` | amber |

Same for primary actions generally: `Track` is navy on Home, `Get Rates` is
navy on Rates, but every CTA in auth is amber. Users cannot learn "amber means
this is the action" because it isn't true. **One accent, one meaning** is the
single highest-value fix in this document, and it is also the cheapest.

### 2. `/home` is a landing page occupying the app's primary screen

"Why Bombino?", `30+ / 140+ / 250+` stat blocks, and WhatsApp/Call buttons sit
above the fold on the screen users open most. That content sells to a first-time
visitor; it is dead weight for anyone who came to ship or track something.
A signed-in customer should see *their* shipments, not the company's stats.

### 3. Three different empty states for the same situation

Signed-out users hit "you need to sign in" three ways:

- `/home` — "Sign in to manage your shipments" + Login/Sign&nbsp;Up pair
- `/orders` — "Sign in to view your shipments" + navy Login
- `/create` — "Please login to continue" + icon + amber Login

Three layouts, three copy variants, two button colours, one situation. This
should be one component.

### 4. Track is duplicated three times, and buried in nav

There is a track field on `/home`, another on `/orders`, and a `/track` route
— but Track is **not** in the bottom nav (Home / Rates / Ship / Orders). For a
courier customer, tracking is likely the single most frequent task. It is
simultaneously the most repeated and the least reachable thing in the app.

### 5. The assistant FAB — mostly a false alarm

**Corrected after reading the source.** `SupportFab` already carries
`aria-label="Open Support Assistant"`, and it is drag-repositionable with the
position persisted for the session, which is a deliberate answer to the
overlap problem. It is more considered than a glance suggested.

The only real gap is that sighted users get no visible label for the sparkles
icon. Left alone: it is a draggable portal component with working behaviour,
and churning it for a cosmetic gain risks more than it returns.

### 6. Navigation is split without a rule

Bottom nav has 4 items; Track, Receive, Notifications, Profile and Help are
only in the hamburger. There is no evident principle for what earns a nav slot.

## Strategy

Four principles, in priority order. Everything below follows from these.

**1. One accent, one meaning.** Dispatch Amber = the primary action on this
screen, and nothing else. Navy becomes structure and text; it stops competing
as a second CTA colour. Exactly one amber element per screen.

**2. The app opens on the user's work.** `/home` leads with the customer's
active shipments and the two things they came to do (track, ship). Marketing
content moves below the fold for signed-out users and disappears entirely once
signed in.

**3. One pattern per problem.** One empty state, one card, one field, one
section header — used everywhere. The auth flow already established these as
`.auth-*` classes; they get promoted to app-wide `.doc-*` equivalents.

**4. Navigation reflects frequency.** Bottom nav carries the four things done
most often. Track earns a slot. Everything else lives in the menu.

## Visual language

Extend Freight Document from auth to the whole app — it is already built,
already tokenised, and it is the only surface that currently looks deliberate.
Concretely: 6px radius, hairline rules instead of blur shadows, Geist Mono for
every number/code/label, uppercase tracked micro-labels, left-aligned.

Brand is unchanged: Admiralty Dark, Dispatch Amber, Poppins.

## Sequencing

Ordered by value-per-effort. Each stage is independently shippable.

| # | Stage | Scope | Why here |
|---|---|---|---|
| 1 | **Accent discipline + shared primitives** | Global tokens, `Button` variants, one `SignedOutState`, `PageHeader`, `EmptyState` | Fixes finding 1 & 3 everywhere at once. Touches every screen but is low-risk and mostly deletion. |
| 2 | **Navigation** | `BottomNav`, `SideMenu`, FAB labelling | Findings 4, 5, 6. Small surface, high daily impact. |
| 3 | **`/home`** | Restructure signed-in vs signed-out | Finding 2. The most-seen screen. |
| 4 | **`/orders` + `/track` + `/shipment/:awb`** | The tracking spine | Highest-frequency task after home. |
| 5 | **`/rates`** | Form language | Self-contained, 719 lines. |
| 6 | **`/create`** | Booking flow | 3,176 lines — the largest and riskiest. Deliberately last, once every pattern it needs is settled. |
| 7 | **`/profile`, `/support`, `/notifications`, `/receive`** | Remainder | Lower traffic. |

## Explicitly not in scope yet

- **Dark mode.** Tokens support it; no surface has been verified against it.
- **`/create` information architecture.** 3,176 lines almost certainly wants
  splitting into steps, but that is a behaviour change, not a restyle, and
  needs its own decision.
- **Desktop.** `HomeDesktop.tsx` exists (757 lines) and diverges from mobile.
  Whether to keep a separate desktop page at all is an open question.
