# Handoff: Bombino Express — Agent app redesign

## Overview

A visual and structural rework of the **agent surface only** (`/agent/*`). The customer app is out of
scope and must not change: no edits to `pages/Home.tsx`, `HomeDesktop.tsx`, `Orders.tsx`,
`OrderDetails.tsx`, `CreateShipment.tsx`, `ShipmentDetails.tsx`, `Track.tsx`, `Rates.tsx`,
`Profile.tsx`, `Support.tsx`, `components/BottomNav.tsx`, or `components/Header.tsx`.

Two goals, in priority order:

1. **Make the agent app dumb.** Every screen holds less. Plain short words only — no long or formal
   English anywhere in the agent UI.
2. **Make the order number the loudest thing on every card.** It is what the agent says on the phone and
   what ops asks for.

The brand is unchanged: Admiralty navy `#1B2A41`, Dispatch Amber `#F2A123`, Poppins + Geist Mono, all
already in `client/src/index.css`.

Seven screens: Today, New, My jobs, One job (pickup detail), Take money (payment sheet), Money
(collections), My week (schedule).

## About the design files

`Agent App v2.dc.html` in this bundle is **the spec** — a static design reference created in HTML,
showing the intended look, hierarchy and exact copy. It is not production code and should not be copied
into the app.

`Agent App.dc.html` is the earlier, denser v1. It is included for context only. **Where the two differ,
v2 wins.**

Recreate v2 inside the existing React + Tailwind v4 codebase using its established patterns: `wouter`
routing, the TanStack Query hooks in `client/src/hooks/useAgentPickups.ts`, the `cn()` helper, and Lucide
icons. Every server contract, hook and data shape stays as it is — this is a presentation and copy
change, with the two exceptions under *Behaviour changes*.

## Fidelity

**High fidelity.** Colours, sizes, weights, spacing and copy in v2 are final. Where a value below
conflicts with current code, the value below wins. **Do not reword the UI copy** — the short words are
the point of this pass.

---

## Rule 1 — the order number is the headline

Every job card opens with a **full-bleed navy strip** as its first child:

```
background:#1B2A41; padding:10px 16px;
display:flex; align-items:center; justify-content:space-between; gap:12px;

  left   order number   Geist Mono 20px / 700 / letter-spacing .02em / #ffffff
  right  status word    Geist Mono 10px / 700 / .14em / uppercase / #F2A123
```

On the **Late** card the strip is `#B91C1C` and the status word is white, not amber.

Compact list rows lead with the number too — Geist Mono 16/700 `#1B2A41` `.02em` on the first line,
customer name 14/600 on the second, mono 10.5px meta on the third.

The **One job** screen puts the number in the top bar: the bar turns navy, back chevron white, number at
mono 20/700 white, status word amber on the right. The **Take money** sheet repeats it at mono 18/700 in
its header row, so the agent can read it out while taking cash.

**Status words** — one word, from this closed set. Nothing longer:

| Word | Means |
| --- | --- |
| `Free` | Unclaimed, available to take |
| `1 day late` / `2 days late` | Overdue (the only two-word case) |
| `Mine` | Accepted, not started |
| `Going` | On the way |
| `Done` | Picked up |

## Rule 2 — short words only

The full agent vocabulary. Use these strings verbatim; do not expand them.

| Where | Copy |
| --- | --- |
| Tabs | `Today` · `New` · `My jobs` · `Money` · `My week` |
| Section bands | `Doing now` · `Next` · `Late` · `Today` · `Later` |
| Buttons | `Take job` · `Picked up` · `Take ₹4,820` · `Call` · `Map` · `Problem` · `Money taken` |
| Job fields | `Time` · `Weight` · `Boxes` · `Goes to` |
| Money | `Take money` · `Cash with you` · `Give to hub today` · `Taken today` · `No money` |
| Payment sheet | `Cash or UPI?` · `How much?` · `Full` · `UPI` · `Cash` |
| Schedule | `Tap the times you can work` · `3 times` · `Off` · `Saved` |
| Screen titles | `Today` · `New jobs` · `My jobs` · `Money` · `My week` |

Banned from the agent UI: docket, unclaimed, reconcile, collection, transaction, available, scheduled,
overdue, confirm, sender, destination, window, estimated, parcel. Also banned: any sentence on a button,
and any explanatory paragraph on a screen.

---

## Design rules

**Colour law.** Today the surface uses navy, amber, red, emerald and grey interchangeably. Fix that:

| Colour | Meaning | Where |
| --- | --- | --- |
| `#F2A123` amber | Money, and nothing else | Take-money strips, cash total, the Take button, nav badges, the status word on a navy strip, the `Agent` tag |
| `#1B2A41` navy | A state change the agent commits | Order-number strips, primary buttons, nav bar, selected time slots, the 2px rule under a title |
| `#B91C1C` on `#FEF2F2`, border `#FECACA` | Late, nothing else | Late card only |
| Greys | Everything else | See tokens |

Emerald appears once: the `Saved` indicator on My week (`#15803D`). No status-chip palette.

**Structure.** One panel per band: `background:#fff; border:1px solid #E2E8F0; border-radius:4px;
overflow:hidden`. Items inside a panel are divided by `border-bottom:1px solid #E2E8F0` only. A card
inside a card, a `border-2`, or a rounded-xl inside a rounded-xl is a defect. Action buttons and number
strips run full-bleed inside the panel.

**Radius.** `4px` on panels. `0` on buttons, slots, strips and full-bleed rows. No `rounded-xl` or
`rounded-2xl` on the agent surface. (The customer app keeps its 12–32px radii.)

**Type — four sizes, no drift.**

| Role | Family | Size / weight |
| --- | --- | --- |
| Screen title | Poppins | 22 / 800 / `-0.02em` / lh 1, then a 2px navy rule at `margin-top:10px` |
| Customer name (card) | Poppins | 20 / 700 / `-0.01em` / lh 1.15 — 26 / 800 on One job |
| Customer name (row) | Poppins | 14 / 600 |
| Address / body | Poppins | 14 / 500 / lh 1.4 / `#334155` — 15 / 500 on One job |
| Order number | Geist Mono | 20 / 700 strip · 18 / 700 sheet · 16 / 700 row |
| Mono label | Geist Mono | 10 / 600–700 / `.14–.16em` / uppercase |
| Mono data | Geist Mono | 11–14 / 500–600 |
| Money figure | Geist Mono | 18 card · 22 Today total · 26 One job · 44 Money screen / 700 |

Status is a word plus weight, never a coloured chip.

**Touch targets.** 56px primary actions and time slots, 60px Call/Map row, 64px payment mode and amount.

**Icons.** Lucide at **stroke-width 1.5** (the design system's rule), 19px in the nav, 16–18px inline.

**Motion.** CSS only — `active:scale-[0.98]`, colour transitions ≤150ms. No GSAP or Framer Motion here.

---

## Screens

### 1. Today (`pages/agent/Dashboard.tsx`)

The two-pill tab panel goes away — an agent should not choose between "what I'm doing" and "what's
available". Column is `flex-col gap-[18px]`, `padding:18px 16px 0`. Four things, nothing else:

1. Title `Today`, mono subtitle `TUE 12 AUG · 2 JOBS`, 2px navy rule.
2. **Doing now** band — one panel: navy number strip, name 20/700, address (one line, area only — no
   pincode), a mono meta row of time + weight. If money is owed, a full-bleed amber strip
   `TAKE MONEY` / amount. Then a full-bleed action row split `100px | 1fr`: `Call` (white, hairline
   divider) then the next lifecycle action in navy 56px, white 16/700, with an amber arrow.
3. **Next** band — one compact row.
4. A full-width amber `Cash with you` bar: mono label left, mono 22/700 total right.

Removed for good: the stats strip, "windows left", pill tabs, and every count except the subtitle.

### 2. New (`pages/agent/AvailablePickups.tsx`)

Title `New jobs`, subtitle `3 FREE TO TAKE` — the count must equal what renders.

Two bands only, **Late** then **Today**, from the existing `groupByDate()`. **Do not add a "Later"
band on this screen** — it overflows a 390×844 viewport and jobs three days out are not what an agent
scans here. (Later-dated available jobs stay reachable from My jobs / a job link.)

- **Late** — panel `background:#FEF2F2; border:1px solid #FECACA`, red number strip, name, address, mono
  meta with the date in `#B91C1C` 700, then full-bleed navy 56px **Take job**.
- **Today** — white panel. The first job is a full card with its own **Take job** button; any others are
  compact rows inside the same panel. One accept button per band keeps the column short and still gives
  one-tap accept for the job most likely to be taken.

Keep the 409 conflict handling, but shorten the toast to `Someone else took it`.

### 3. My jobs (`pages/agent/MyPickups.tsx`)

Title `My jobs`, subtitle `3 JOBS`. Bands `Today` and `Later`.

Today's jobs are full entries stacked inside **one** panel, each introduced by its own navy number
strip and divided by hairlines — not one bordered card each. Meta row is time + weight, with the amber
amount chip (`padding:3px 6px`) pushed right by `margin-left:auto`, or mono `NO MONEY` in `#64748B` when
nothing is owed.

Later jobs are compact rows: number, name, `14 AUG · LOKHANDWALA`.

Removed: the "handed to hub" note from v1 (it needed a count the client does not hold).

### 4. One job (`pages/agent/PickupDetail.tsx`)

Four stacked bordered cards become **one white sheet** with a fixed action bar.

- **Top bar** is navy: white back chevron, order number mono 20/700 white, status word amber right.
- **Header** `padding:18px 16px 16px`, hairline under: name 26/800, full address 15/500 over two lines.
- **Call | Map** — two 60px halves split by one hairline. Same `tel:` and Google Maps targets as today.
- **Four fields**, `padding:11px 0`, divided by `1px solid #EEF2F6`: `Time` → `TODAY · 10 AM–12 PM`,
  `Weight` → `4.5 KG`, `Boxes` → `2`, `Goes to` → `EDISON, NJ · USA`. Labels mono 11/500 uppercase
  `#64748B`; values mono 14/600 navy, right-aligned. No section heading above them. The customer's
  details appear once on this screen — the v1 `PickupCard` + "Collect from" duplication is gone.
- **Amber money field** when `amountOwedAtDoor()` is non-null: `margin:12px 16px 0`, `TAKE MONEY` left,
  amount mono 26/700 right. No quoted date, no paid/unpaid line.
- **Fixed action bar** above the nav, white, hairline top, `padding:12px 16px 14px`, `gap:8px`: amber
  56px `Take ₹4,820` on its own row, then navy 56px `Picked up` beside a 104px hairline `Problem`.
  Buttons still come from `entry.availableActions` — the bar renders whatever the server sends, first
  action primary; the money action is always the amber one.

### 5. Take money (`components/agent/CollectPaymentSheet.tsx`)

Bottom sheet, square top corners (was `rounded-t-[20px]`), no drag handle, `padding:16px 16px 22px`,
shadow `0 -12px 40px rgba(15,22,32,.28)`.

- Header row over a 2px navy rule: order number mono 18/700 left, mono 11/600 `TAKE MONEY` right.
- `CASH OR UPI?` then two 64px halves. Selected = navy fill, white 17/700, amber icon. Unselected =
  white with a `#CBD5E1` hairline. No default selection (unchanged).
- `HOW MUCH?` then a 64px field with a 1px navy border: mono ₹ 22/600 `#64748B`, value mono 28/700, and
  a mono 11px `FULL` reset on the right.
- Amber 56px **Money taken**.
- Receipt state: the amount at mono 44/700 and a navy 56px `Done`. Drop the emerald circle-check.
- **Cut:** the UPI-reference input and the transaction ID. See *Open items* — confirm with ops first.

### 6. Money (`pages/agent/Collections.tsx`)

Title `Money`, subtitle `TODAY`.

- **Amber field**, square, `padding:16px`: `CASH WITH YOU` mono 10/700, figure mono 44/700, then a
  divider `1px solid rgba(27,42,65,.28)` and one mono 11/600 line `GIVE TO HUB TODAY`.
- **Taken today** panel: one row per collection — order number mono 16/700, a mono 10.5px line
  `9:12 AM · CASH`, amount mono 18/700 right. Hairline dividers, no per-row card, no icons.
- **Cut:** the UPI-vs-cash split, the collection count, transaction IDs, and the closing sentence.

### 7. My week (`pages/agent/Schedule.tsx`)

One panel, seven rows, one expanded.

- Collapsed row `padding:15px 16px`: 44px mono 13/700 day abbreviation, then `3 times` in mono 13/500
  `#475569`, then a chevron. A day off reads `Off` and the whole row drops to `#94A3B8` with a `#CBD5E1`
  chevron. **Do not list the individual windows on a collapsed row** — a count is enough.
- Expanded row `background:#F8FAFC`: header shows the day, mono 10/700 amber `TODAY` (when it is today)
  and a chevron-up; then a 2-column grid, `gap:8px`, of four 56px slots labelled `10–12`, `12–2`, `2–4`,
  `4–6`. Selected = navy fill, white mono 14/600, amber check. Unselected = white, `#CBD5E1` hairline.
- **Cut:** the `All day` / `Copy Mon–Fri` bulk actions, the separate `Day off` button (clearing all four
  slots is the same act and the summary already says `Off`), and the footer sentence.
- Save state: mono 10/600 `SAVED` in `#15803D` beside the title, `SAVING` in `#64748B`. Same
  non-optimistic mutation as today.

---

## Behaviour changes (only two)

1. **Today loses its tab selector.** `Tab` state, `PanelTabs`, `chosen`/`selected` and the
   `CALLS_ON_HOME` slice go away. The screen shows the job in hand plus the next one, and links to New
   for the queue.
2. **Nav labels change** to fit five items without truncation: `Today`, **`New`** (was Available),
   `My jobs`, **`Money`** (was Collected), `My week`. Routes are unchanged — labels only.

Everything else is untouched: `availableActions` rendering, the server-owned state machine, 409
handling, IST date banding, the non-optimistic schedule save.

## Bottom nav (`components/agent/AgentNav.tsx`, `components/TabBar.tsx`)

The agent surface needs a variant — `TabBar` is shared with the customer app, so either add an optional
`variant="agent"` prop or fork a small agent bar. Agent spec:

- 66px tall, `background:#1B2A41`, no shadow, no rounded pills.
- Active: white icon and label plus a **2px `#F2A123` top border** on the item (replaces the floating
  white underline pill).
- Inactive: `rgba(255,255,255,.6)` icon and label.
- Labels: Geist Mono 9 / 600 / `.1em` / uppercase.
- Badges: amber pill `min-width:16px; height:16px`, navy mono 9.5/700, at `top:8px; right:24px`. The
  badge count must equal what the destination screen actually renders.
- Icons: Lucide 19px, stroke-width 1.5 — layout-grid, package-search, clipboard-list, wallet,
  calendar-days.

## Tokens

```
Navy (Admiralty)      #1B2A41   text, number strips, primary fills, nav
Amber (Dispatch)      #F2A123   money only
Paper                 #F8F9FA   screen background
Card                  #FFFFFF   panels, sheets
Border                #E2E8F0   hairlines
Border strong         #CBD5E1   section rules, unselected slot edges
Divider light         #EEF2F6   field row rules
Body ink              #334155   addresses
Secondary ink         #475569   row meta
Muted ink             #64748B   mono labels
Disabled ink          #94A3B8   days off
Red ink / ground / edge   #B91C1C / #FEF2F2 / #FECACA   late only
Green (save only)     #15803D

Radius   4px panels · 0 buttons, slots, strips, full-bleed rows
Spacing  4 · 8 · 10 · 12 · 14 · 16 · 18 (nothing else)
Heights  56 primary action & time slot · 60 Call/Map · 64 payment mode & amount · 66 nav · 52 top bar
Fonts    Poppins 500/600/700/800 · Geist Mono 500/600/700 (both already loaded)
```

## Assets

- `assets/bombino-logo.png` — the repo's own `client/src/assets/bombino-logo.png`. Nothing new.
- All icons are Lucide, already a dependency. The design files hand-inline simplified SVGs — use the
  real Lucide components in the implementation, at stroke-width 1.5.

## Files in this bundle

- `Agent App v2.dc.html` — **the spec.** Seven screens. Open in a browser.
- `Agent App.dc.html` — v1, denser. Context only; v2 supersedes it.
- `assets/bombino-logo.png`

## Files to change

```
client/src/pages/agent/Dashboard.tsx          rebuilt — tabs and stats removed
client/src/pages/agent/AvailablePickups.tsx   two bands, one Take job per band
client/src/pages/agent/MyPickups.tsx          one panel per band, number strips
client/src/pages/agent/PickupDetail.tsx       single sheet, navy top bar, fixed action bar
client/src/pages/agent/Collections.tsx        amber field + simple list
client/src/pages/agent/Schedule.tsx           one panel, accordion, four slots
client/src/components/agent/PickupCard.tsx    restyle around the number strip; helper exports unchanged
client/src/components/agent/BandHeader.tsx    mono label + hairline; new short band names
client/src/components/agent/SlotChip.tsx      likely deleted — time is mono meta text now
client/src/components/agent/ActionButtons.tsx moves into the fixed bar; amber for the money action
client/src/components/agent/CollectPaymentSheet.tsx  square sheet, short copy, colour law
client/src/components/agent/AgentShell.tsx    title block; navy top bar variant for One job
client/src/components/agent/AgentNav.tsx      agent nav variant, new labels
client/src/components/TabBar.tsx              add a variant OR leave alone and fork for agent
client/src/lib/agentGrouping.ts               band names + BAND_TONE updated to the colour law
```

Do not touch the customer pages listed in *Overview*, or the shared `doc-*` classes in `index.css` (used
by the auth and booking screens).

## Watch-outs

- **390×844 is the budget.** Frame 02 in the design overflowed twice during review before the Later band
  was dropped. When a screen gains a band, something else has to give — a full card is roughly 3× the
  height of a compact row.
- **Counts must be truthful.** Subtitle counts and nav badges have to match what renders after any band
  or row is cut.
- **Copy is spec, not suggestion.** If a string feels too terse, leave it — that is the brief.

## Open items for the team

- **`Problem`** on One job has no route or endpoint. Wire it to a hub-call action or drop it before
  shipping.
- **Transaction ID and UPI reference** were cut from the payment sheet and the Money list on the
  assumption an agent never reads them aloud. If ops asks agents for a txn ID by phone, put the ID back
  on the Money row as a mono 10.5px third line.
- Per-date schedule exceptions remain out of scope, as today (`open-items.md`).
