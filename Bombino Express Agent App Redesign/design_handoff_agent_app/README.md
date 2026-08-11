# Handoff: Bombino Express — Agent app redesign

## Overview

A visual and structural rework of the **agent surface only** (`/agent/*`). The customer app is out of
scope and must not change: no edits to `client/src/pages/Home.tsx`, `Orders.tsx`, `CreateShipment.tsx`,
`ShipmentDetails.tsx`, `BottomNav.tsx`, or anything else the customer routes render.

The redesign keeps the product's existing brand — Admiralty navy, Dispatch Amber, Poppins, Geist Mono —
and replaces the agent surface's card-stack layout with a **docket grammar**: one ruled sheet per screen,
4px corners, hairline dividers, no border inside a border. Type is locked to four sizes, and colour
carries exactly three meanings.

Seven screens are covered: Today, Calls (available), My jobs, Job sheet (pickup detail), Collect payment,
Money (collections), My week (schedule).

## About the design files

`Agent App.dc.html` in this bundle is a **design reference created in HTML** — a static prototype showing
the intended look, hierarchy and copy. It is not production code and should not be copied into the app.

The task is to **recreate these designs inside the existing React + Tailwind v4 codebase**, using its
established patterns: `wouter` for routing, TanStack Query hooks in `client/src/hooks/useAgentPickups.ts`,
the `cn()` helper, Lucide icons, and the token layer in `client/src/index.css`. Every server contract,
hook and data shape stays as it is — this is a presentation change, not a behaviour change, with two
exceptions noted under *Behaviour changes*.

## Fidelity

**High fidelity.** Colours, type sizes, weights, spacing and copy in the prototype are final and should be
matched. Where a value below conflicts with something in the current code, the value below wins.

---

## Design rules (apply to every agent screen)

**Colour law — the single biggest fix.** Today the surface uses navy, amber, red, emerald and grey
interchangeably.

| Colour | Meaning | Where it may appear |
| --- | --- | --- |
| `#F2A123` Dispatch Amber | Money, and nothing else | Collect blocks, cash totals, the Collect button, nav badges (counts of work owed), the "Agent" wordmark tag |
| `#1B2A41` Admiralty navy | A state change the agent commits | Primary action buttons, bottom nav fill, selected toggles, the 2px rule under a screen title |
| `#B91C1C` on `#FEF2F2` | Late, and nothing else | Overdue band header, overdue row background, overdue meta text |
| Greys | Everything else | See tokens |

No emerald except the "Saved" indicator on My week (`#15803D`). No status chip palette. No coloured
borders other than overdue.

**Structure.** One panel per band: `background:#fff; border:1px solid #E2E8F0; border-radius:4px`.
Items inside a panel are separated by `border-bottom:1px solid #E2E8F0` only. A card inside a card, a
`border-2`, or a rounded-xl inside a rounded-xl is a defect. Full-bleed action buttons run edge-to-edge
inside the panel (negative horizontal margin equal to the panel padding).

**Radius.** `4px` on panels and blocks. `0` on buttons, toggles and full-bleed rows. No `rounded-xl`,
no `rounded-2xl` anywhere on the agent surface. (Customer app keeps its 12–32px radii.)

**Type — four sizes, no drift.**

| Role | Family | Size / weight | Notes |
| --- | --- | --- | --- |
| Screen title | Poppins | 22px / 800 / `-0.02em` / lh 1 | Followed by a 2px `#1B2A41` rule, `margin-top:10px` |
| Sender name (lead) | Poppins | 20px / 700 / `-0.01em` / lh 1.15 | 26px / 800 on the job sheet only |
| Sender name (row) | Poppins | 16px / 700 | Compact list rows |
| Address / body | Poppins | 14px / 500 / lh 1.4 | `#334155`. 13px / 500 `#475569` in compact rows |
| Mono label | Geist Mono | 10px / 600–700 / `0.14–0.16em` / uppercase | Section heads, status eyebrows, field labels |
| Mono data | Geist Mono | 11–13px / 500–700 | Windows, weights, order numbers, amounts, txn ids |
| Money figure | Geist Mono | 18px (row) / 26px (sheet) / 44px (Money screen) / 700 | Tabular, `#1B2A41` |

Nothing sits at 15px, 17px or 19px except the two button labels (15/16px). Status is size and weight,
never a coloured chip.

**Touch targets.** Primary actions 56px. Secondary rows 52–60px. Slot toggles 52px. Bulk actions 44px.

**Motion.** CSS transitions only (`active:scale-[0.98]`, colour transitions ≤150ms). No GSAP, no Framer
Motion on this surface — unchanged from today's rule in PRODUCT.md.

---

## Screens

### 1. Today (`pages/agent/Dashboard.tsx`)

Replaces the two-pill tab panel. The tabs are gone: an agent should not choose between "what I'm doing"
and "what's available" — both are on the page, ranked.

Layout, top to bottom, in a `flex-col gap-[18px]` column with `padding:18px 16px 0`:

1. **Date header.** `Tuesday, 12 Aug` at 22/800 with the agent's name right-aligned in mono 10px
   uppercase `#64748B`. 2px navy rule beneath. Then a three-figure strip (`gap:24px`): `02 In hand`,
   `05 Open calls`, `10–12 Window now` — mono 20/700 figure over a mono 9.5px uppercase label. This is
   the one place a count appears; it is a strip of facts, not stat tiles (no boxes, no borders).
2. **Working now** — section head (mono 10px uppercase `#1B2A41` + hairline `#CBD5E1` filling the row).
   One panel holding the job furthest along: status eyebrow + order no, name 20/700, address 14/500,
   mono meta row (window, weight). If money is owed: a full-bleed amber strip, `padding:10px 16px`,
   "COLLECT AT DOOR" mono 10/700 left, amount mono 18/700 right. Then a full-bleed action row split
   `112px | 1fr`: **Call** (white, hairline divider) and the next lifecycle action in navy 56px with a
   white 15/700 label and an amber arrow.
3. **Next up · N more today** — panel of compact rows: name 16/700, address 13/500 `#475569`, mono
   10.5px meta. Overdue rows take the `#FEF2F2` background and red meta. Amount, if owed, is an amber
   chip `padding:4px 7px` before the chevron.
4. **Two ledger tiles**, `gap:10px`: Cash in bag / Windows left. Mono 9.5px uppercase label over a mono
   22/700 figure, in white panels.

Loading: keep the current spinner + "Loading…" copy. Empty: a single line of body copy in the panel,
no icon, no illustration (unchanged rule from PRODUCT.md).

### 2. Calls (`pages/agent/AvailablePickups.tsx`)

Title `Open calls`, subtitle mono `5 unclaimed · oldest first`, 2px rule.

Bands in order **Overdue → Today → Scheduled**, from the existing `groupByDate()` — no logic change.
Band head: mono 10px uppercase label, hairline, count on the right. Overdue's head is `#B91C1C` with a
`#FECACA` hairline.

- **Overdue band**: panel `background:#FEF2F2; border:1px solid #FECACA`, eyebrow `LATE · SINCE 11 AUG`
  in red mono, then name/address/meta, then a full-bleed navy 56px **Accept this job**.
- **Today band**: white panel. The first job carries the full card + Accept button; the rest are compact
  rows (name 16/700 + mono meta line). One accept button per band keeps the column readable and still
  gives a one-tap accept for the job most likely to be taken.
- **Scheduled band**: compact rows only, chevron to the job sheet.

Keep the 409 "Someone got there first" toast exactly as written.

### 3. My jobs (`pages/agent/MyPickups.tsx`)

Title `My jobs`, subtitle mono `3 accepted · 2 due today`.

Bands Today / Scheduled, same heads. Today's jobs are full entries stacked inside **one** panel divided
by hairlines — not one bordered card each. Each entry: status eyebrow + order no, name 20/700, address,
then a meta row where the amber amount chip is pushed right with `margin-left:auto`.

Scheduled jobs are compact rows with a mono `STARTS 14 AUG · IN 2 DAYS` line (this is the existing
`notDueYetReason()` string, reformatted).

Below the bands, above the fold end: a hairline-topped note — `Handed to hub today — 2 parcels ·
BEX-24068, BEX-24071. They leave this list once ops signs for them.` This answers the "where did my job
go?" question the current one-directional drop leaves open. Requires a small addition: the count of
today's `received_at_hub` orders. If that is not cheaply available, ship the screen without this block
rather than faking it.

### 4. Job sheet (`pages/agent/PickupDetail.tsx`)

The biggest structural change: four stacked bordered cards become **one white sheet** that fills the
screen, with a fixed action bar.

- **Top bar**: back chevron + mono `MY JOBS` (or `CALLS`), order number mono right-aligned. Replaces the
  logo bar on this screen — the agent is inside a job, not at the app root.
- **Header block** (`padding:18px 16px 16px`, hairline below): status eyebrow mono 10/700 `ON THE WAY ·
  TODAY`, name 26/800, full address 15/500 on two lines.
- **Contact row**: two 60px halves, `Call sender` and `Directions`, split by one hairline. Same `tel:`
  and Google Maps targets as today.
- **The docket**: mono 10px uppercase head `THE DOCKET`, then label/value rows at `padding:9px 0`
  separated by `1px solid #EEF2F6` — Window, Booked weight, Pieces, Destination, Payment. Labels mono
  11/500 uppercase `#64748B`, values mono 13/600 `#1B2A41`, right-aligned. This replaces the
  `PickupCard` + "Collect from" card duplication; the sender's details appear once.
- **Money block** (only when `amountOwedAtDoor()` is non-null): amber field, `margin:12px 16px 0`,
  "COLLECT AT DOOR" + quoted-date sub-line left, amount mono 26/700 right.
- **Fixed action bar**, above the nav, white with a hairline top, `padding:12px 16px 14px`, `gap:8px`:
  amber 56px `Collect ₹4,820` on its own row, then navy 56px `Mark picked up` beside a 104px hairline
  `Problem` button. Buttons still come from `entry.availableActions` — the bar renders whatever the
  server sends, first action primary, and the money action is the amber one wherever it appears in the
  list. `Problem` has no route today; see *Open items*.

Keep `CollectPaymentSheet` mounting from here unchanged.

### 5. Collect payment (`components/agent/CollectPaymentSheet.tsx`)

Bottom sheet, square top corners (was `rounded-t-[20px]`), no drag handle, `padding:16px 16px 22px`,
shadow `0 -12px 40px rgba(15,22,32,.28)`.

- Head row: mono 11/700 `COLLECT · BEX-24081` left, mono 11/500 `DUE ₹4,820` right, over a 2px navy rule.
- `HOW DID YOU TAKE IT?` mono head, then two 64px halves: selected is navy fill with white 16/700 label
  and an amber icon; unselected is white with a `#CBD5E1` hairline. Mode still has no default.
- `AMOUNT TAKEN` head, then a 64px field with a 1px navy border: mono ₹ 22/600 `#64748B`, value mono
  28/700, and a mono 10px `FULL AMOUNT` reset affordance right-aligned.
- UPI reference field directly below, sharing the field's edges (`border-top:none`), 52px.
- Amber 56px **Confirm collection**.
- Receipt state (unchanged behaviour): replace the body with the amount at mono 44/700, the txn id in a
  hairline block with a copy affordance, and a navy 56px Done. Drop the emerald circle-check — the
  receipt is a document, not a celebration.

### 6. Money (`pages/agent/Collections.tsx`)

Title `Money today`, subtitle mono `Reconcile before you hand over`.

- **Amber field**, square, `padding:16px`: `CASH IN YOUR BAG` mono 10/700, figure mono 44/700, then a
  divider `1px solid rgba(27,42,65,.28)` and two mono 11/600 facts: `₹7,340 BY UPI`, `4 COLLECTIONS`.
- **Ledger** panel: one row per collection — txn id mono 13/600, then a mono 10.5px line
  `BEX-24068 · 9:12 AM · CASH`, amount mono 17/700 right-aligned. Rows divided by hairlines. No per-row
  card, no icons.
- Closing line, hairline above: `Hand the cash to the hub at the end of your shift. UPI is already
  settled.`

### 7. My week (`pages/agent/Schedule.tsx`)

One panel, seven rows, one expanded.

- Collapsed row: `padding:14px 16px`, a 44px mono 12/700 day abbreviation, then the window summary in
  mono 12/500 `#475569`. Days off render `Day off` and the whole row drops to `#94A3B8`.
- Expanded row: `background:#F8FAFC`, header line shows mono 10/700 amber `TODAY · EDITING` and a
  chevron-up, then a 2-column grid `gap:8px`: four 52px slot toggles (selected = navy fill, white mono
  13/600, amber check; unselected = white with `#CBD5E1` hairline), then two 44px bulk actions
  (`All day`, `Copy Mon–Fri`). `Day off` is dropped as a separate button — clearing all four slots is
  the same act and the summary already says "Day off".
- Save state: mono 10/600 `SAVED` in `#15803D` beside the title; `SAVING` in `#64748B`. Same
  non-optimistic mutation as today.

---

## Behaviour changes (only two)

1. **Today loses its tab selector.** `Tab` state, `PanelTabs`, `chosen`/`selected` and the
   `CALLS_ON_HOME` slice go away; the screen renders "working now" (the furthest-along held job) plus the
   rest of today's work, and links out to Calls for the queue.
2. **Nav labels change** to fit five items without truncation: Today, **Calls** (was Available),
   **My jobs**, **Money** (was Collected), **My week**. Routes are unchanged — label only.

Everything else — `availableActions` rendering, the server-owned state machine, 409 handling, IST date
banding, the non-optimistic schedule save — is untouched.

## Bottom nav (`components/agent/AgentNav.tsx` + `components/TabBar.tsx`)

The agent surface needs a variant, not a rewrite of the shared `TabBar` (the customer app uses it too).
Either add an optional `variant="agent"` prop or give the agent surface its own bar. Agent spec:

- 66px tall, `background:#1B2A41`, no shadow, no rounded pills.
- Active item: white icon and label, plus a **2px `#F2A123` top border** on the item (replaces the
  floating white underline pill).
- Inactive: `rgba(255,255,255,.6)` for icon and label.
- Labels: Geist Mono 9px / 600 / `0.1em` / uppercase.
- Badges: amber pill, `min-width:16px; height:16px`, navy mono 9.5/700, positioned `top:8px; right:24px`.
- Icons: Lucide at stroke-width 2, 19px.

## Design tokens

Existing tokens in `client/src/index.css` cover most of this; these are the literals the prototype uses.

```
Navy (Admiralty)      #1B2A41    text, primary fills, nav
Amber (Dispatch)      #F2A123    money only
Paper                 #F8F9FA    screen background
Card                  #FFFFFF    panels, sheets
Border                #E2E8F0    hairlines
Border strong         #CBD5E1    section rules, unselected toggle edges
Divider light         #EEF2F6    docket row rules
Body ink              #334155    addresses, body copy
Secondary ink         #475569    compact-row body
Muted ink             #64748B    mono labels
Disabled ink          #94A3B8    days off, chevrons
Red ink               #B91C1C    overdue
Red ground            #FEF2F2    overdue rows
Red edge              #FECACA    overdue panel border
Green (save only)     #15803D

Radius   4px panels · 0 buttons, toggles, full-bleed rows
Spacing  4 · 8 · 10 · 12 · 14 · 16 · 18 · 24 (nothing else)
Heights  56 primary action · 60 contact row · 52 toggle · 44 bulk action · 66 nav
Fonts    Poppins 500/600/700/800 · Geist Mono 500/600/700 (both already loaded)
```

## Assets

- `assets/bombino-logo.png` — copied from `client/src/assets/bombino-logo.png`. Use the repo copy;
  nothing new is introduced.
- All icons are Lucide, already a dependency. Icons used: chevron-left, chevron-right, chevron-up,
  phone, navigation, check, log-out, and the five nav icons (layout-grid, package-search,
  clipboard-list, wallet, calendar-days). The prototype hand-inlines simplified SVGs — use the real
  Lucide components in the implementation.

## Files in this bundle

- `Agent App.dc.html` — the seven-screen design reference. Open in a browser.
- `assets/bombino-logo.png` — logo used by the prototype.

## Files to change in the codebase

```
client/src/pages/agent/Dashboard.tsx          rebuilt (tab selector removed)
client/src/pages/agent/AvailablePickups.tsx   band panels, one accept per band
client/src/pages/agent/MyPickups.tsx          band panels, compact scheduled rows
client/src/pages/agent/PickupDetail.tsx       single sheet + fixed action bar
client/src/pages/agent/Collections.tsx        amber field + ledger
client/src/pages/agent/Schedule.tsx           one panel, accordion rows
client/src/components/agent/PickupCard.tsx    restyle; helper exports unchanged
client/src/components/agent/SlotChip.tsx      likely deleted — the window is mono meta text now
client/src/components/agent/BandHeader.tsx    restyle to mono + hairline + count
client/src/components/agent/ActionButtons.tsx moves into the fixed bar; amber for the money action
client/src/components/agent/CollectPaymentSheet.tsx  square sheet, navy/amber per the colour law
client/src/components/agent/AgentShell.tsx    title block + agent top bar
client/src/components/agent/AgentNav.tsx      agent nav variant, new labels
client/src/components/TabBar.tsx              add a variant OR leave alone and fork for agent
client/src/lib/agentGrouping.ts               BAND_TONE values updated to the colour law above
```

Do not touch: `pages/Home.tsx`, `HomeDesktop.tsx`, `Orders.tsx`, `OrderDetails.tsx`,
`CreateShipment.tsx`, `ShipmentDetails.tsx`, `Track.tsx`, `Rates.tsx`, `Profile.tsx`, `Support.tsx`,
`components/BottomNav.tsx`, `components/Header.tsx`, or the `doc-*` classes in `index.css` (shared with
the auth and booking screens).

## Open items for the team

- **`Problem` button** on the job sheet has no route or endpoint. Either wire it to a hub-call action or
  drop it before shipping.
- **"Handed to hub today"** on My jobs needs a count the client does not currently hold.
- The redesign assumes no per-date schedule exceptions, same as today (`open-items.md`).
