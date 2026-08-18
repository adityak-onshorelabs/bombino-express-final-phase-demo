# Handoff: Bombino Express — Agent app redesign

## Overview

A rework of the **agent surface only** (`/agent/*`). The customer app is out of scope and must not
change: no edits to `pages/Home.tsx`, `HomeDesktop.tsx`, `Orders.tsx`, `OrderDetails.tsx`,
`CreateShipment.tsx`, `ShipmentDetails.tsx`, `Track.tsx`, `Rates.tsx`, `Profile.tsx`, `Support.tsx`,
`components/BottomNav.tsx`, or `components/Header.tsx`.

Four goals, in priority order:

1. **Room to breathe.** The old agent screens were cramped. Generous padding, tall rows, big type.
2. **The order number is the loudest thing on every card** — it is what the agent says on the phone and
   what ops asks for.
3. **Every fact is labelled and iconed** — place, time, weight, money each get their own row.
4. **Plain short words only.** No long or formal English anywhere in the agent UI.

Brand is unchanged: Admiralty navy `#1B2A41`, Dispatch Amber `#F2A123`. The **typeface changes** — see
*Type*.

Seven screens: Today (its title reads `Agent`), New, My jobs, One job (pickup detail), Take money
(payment sheet), Money
(collections), My week (schedule).

## About the design files

`Agent App v4.dc.html` in this bundle is **the spec** — a static design reference created in HTML
showing the intended look, sizes and exact copy. It is not production code and should not be copied into
the app.

`Agent App v3.dc.html` and `Agent App v2.dc.html` are earlier, tighter passes, included as context only.
**Where they differ from v4, v4 wins.** v4 differs from v3 mainly in scale (everything is larger and
further apart) and in that its screens scroll.

Recreate v4 inside the existing React + Tailwind v4 codebase using its established patterns: `wouter`
routing, the TanStack Query hooks in `client/src/hooks/useAgentPickups.ts`, the `cn()` helper, Lucide
icons. Every server contract, hook and data shape stays as it is — this is presentation and copy, with
the two exceptions under *Behaviour changes*.

## Fidelity

**High fidelity.** Sizes, colours, spacing and copy in v4 are final. Where a value below conflicts with
current code, the value below wins. **Do not reword the UI copy** — the short words are the brief.

---

## Rule 1 — screens scroll; spend the room on air

The single biggest correction. Earlier passes tried to fit each screen inside one 844px viewport, which
is what made everything feel cramped. Each agent screen is a **normal scrolling column**
(`overflow-y: auto`) between a fixed top bar and the fixed bottom nav. Content taller than the viewport
is correct and expected.

```
Screen padding      20px sides, 20px top, 24px bottom
Between sections    22px (Today) / 20px (list screens)
Between sibling cards in a band   14px
Inside a card       16px padding; fact rows 15–18px vertical
Fact row height     ~60px (was ~40)
```

Hide the scrollbar (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) — the content is
short enough that a bar is noise.

## Rule 2 — the order number is the headline

Every job card opens with a **full-bleed navy strip** as its first child:

```
background:#1B2A41; padding:13px 16px;
display:flex; align-items:center; justify-content:space-between; gap:12px;

  left   order number   21px / 700 / letter-spacing .02em / #ffffff
  right  status word    12px / 700 / .10em / uppercase / #F2A123
```

On the **late** card the strip is `#B91C1C` and the status word is white. In the Today rail the strip is
slightly smaller (19px number, 11px status, `padding:11px 14px`). On **One job** the number moves into
the top bar: the bar turns navy, back chevron white, number 22/700 white, status word amber right. The
**Take money** sheet repeats it at 21/700 in its header row so the agent can read it aloud.

**Status words** — one word, from this closed set:

| Word | Means |
| --- | --- |
| `Free` | Unclaimed, available to take |
| `1 day late` / `2 days late` | Overdue (the only two-word case) |
| `Mine` | Accepted, not started |
| `Going` | On the way |
| `Done` | Picked up |

## Rule 3 — one fact per row, labelled and iconed

No bare runs of words. Each fact is its own row inside the card, divided by `1px solid #E8EDF2`, laid
out `icon | label above value`:

```
icon    23–24px Lucide, stroke-width 1.5, flex:none
        amber #F2A123 when the fact is the agent's next concern (place, time)
        grey  #94A3B8 when it is reference (weight, boxes, goes to)
label   11px / 700 / .12em / uppercase / #94A3B8
value   20px / 700 / #1B2A41, 6px below the label
gap     14–15px between icon and text
```

| Fact | Icon (Lucide) | Label | Example value |
| --- | --- | --- | --- |
| Address | `map-pin` | `Place` | `402 Sunder Nagar` + `Andheri West, Mumbai 400053` on a second line, 17px/500 `#475569` |
| Window | `clock` | `Time` | `Today · 10 AM – 12 PM` |
| Weight | `package` | `Weight` | `4.5 kg` |
| Pieces | `rectangle-horizontal` | `Boxes` | `2` |
| Destination | `globe` | `Goes to` | `Edison, NJ · USA` |
| Money | `credit-card` | `Take money` | amber field, amount 23–28px/700 |

Two facts may share a row only when both are short (weight + boxes, time + weight) — the second is
pushed right with `margin-left:auto; text-align:right` and keeps its own label.

## Rule 4 — short words only

Use these strings verbatim; do not expand them.

| Where | Copy |
| --- | --- |
| Tabs | `Today` · `New` · `My jobs` · `Money` · `My week` |
| Sections | `Doing now` · `New jobs` · `Today` · `Later` |
| Buttons | `Take job` · `Picked up` · `Take ₹4,820` · `Call` · `Map` · `Problem` · `Money taken` |
| Facts | `Place` · `Time` · `Weight` · `Boxes` · `Goes to` |
| Money | `Take money` · `Cash with you` · `Give to hub today` · `Taken today` · `No money` |
| Payment sheet | `Cash or UPI?` · `How much?` · `Full` · `UPI` · `Cash` |
| Schedule | `Tap the times you can work.` · `3 times` · `Off` · `Saved` |
| Titles | `Agent` · `New jobs` · `My jobs` · `Money` · `My week` |

Banned from the agent UI: docket, unclaimed, reconcile, collection, transaction, available, scheduled,
overdue, confirm, sender, destination, window, estimated, parcel. Also banned: any sentence on a button,
and any explanatory paragraph (the one exception is `Tap the times you can work.` on My week).

---

## Type

**The typeface changes to a plain system sans.** Poppins, Geist Mono and any condensed face are dropped
from the agent surface — the user found them "weird" and asked for something generic. The customer app
keeps Poppins; scope the change to agent routes.

```css
font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
font-variant-numeric: tabular-nums;   /* on the agent root — amounts and times must align */
```

Order numbers and amounts get `letter-spacing: .02em`; they are ordinary sans text, not monospace.

| Role | Size / weight |
| --- | --- |
| Screen title | 28 / 700 / `-0.02em` |
| Title meta (right of title) | 15 / 600 / `#64748B` |
| Section label | 12 / 700 / `.14em` / uppercase / `#64748B` |
| Customer name | 22 / 700 (card) · 28 / 700 (One job, Take money) |
| Order number | 21 / 700 (card strip) · 22 (One job bar) · 19 (rail, list row) |
| Fact label | 11 / 700 / `.12em` / uppercase / `#94A3B8` |
| Fact value | 20 / 700 (19 on compact rows) |
| Address second line | 17 / 500 / `#475569` / lh 1.45 |
| Money figure | 23 (card) · 25 (Today bar) · 28 (One job) · 50 (Money screen) / 700 |
| Button label | 19–20 / 700 (primary) · 18–19 / 600 (secondary) |
| Nav label | 11 / 600 |

Nothing on the agent surface is below 11px, and 11px is only ever an uppercase label.

## Colour law

| Colour | Meaning | Where |
| --- | --- | --- |
| `#F2A123` amber | Money, and the agent's next concern | Money fields and buttons, cash total, place/time icons, status word on a navy strip, nav badges, the `Agent` tag |
| `#1B2A41` navy | A state change the agent commits | Order-number strips, primary buttons, nav bar, selected time slots |
| `#B91C1C` on `#FEF2F2`, border `#FECACA` | Late, nothing else | Late card only |
| Greys | Everything else | See tokens |

Emerald appears once: `Saved` on My week (`#15803D`). No status-chip palette. No coloured borders except
the late card.

## Structure

Cards: `background:#fff; border:1px solid #D8DFE7; border-radius:0`. Rows inside a card are divided by
`1px solid #E8EDF2` only — never a nested card, never a `border-2`, never a rounded corner. Number
strips, money fields and action buttons run full-bleed inside the card. Sibling cards in a band are
separate cards with a 14px gap (not one panel with hairlines — at this scale they read better apart).

**Touch targets:** 60–68px buttons, 62px time slots, 70px payment mode/amount fields, 36px rail arrows,
70px nav.

**Motion:** CSS only — `active:scale-[0.98]`, colour transitions ≤150ms. No GSAP or Framer Motion here.

---

## Screens

### 1. Today — titled `Agent` (`pages/agent/Dashboard.tsx`)

The two-pill tab panel goes away. Scrolling column, `gap:22px`, four blocks:

1. Title `Agent` 28/700, alone on its row. **No date and no `Today` heading** — the screen carries no
   date at all, and the word on the title line is the same word as the amber eyebrow in the top bar.
2. **New jobs** — the horizontal rail, see below. It is the **first** block under the title.
3. **Doing now** — one card for the job furthest along: number strip, name 22/700, then Place / Time /
   Weight as three separate fact rows, then the amber `Take money` field (label + amount 23/700) when
   money is owed, then a full-bleed action row split `116px | 1fr`: `Call` (white, hairline divider)
   and the next lifecycle action in navy 64px with a white 19/700 label and an amber arrow.
4. Full-width amber **Cash with you** bar: icon + label left, total 25/700 right.

The rail sits above the fold, ahead of the job in hand — free work the agent can take is what the screen
opens on. `Doing now` follows it and runs past the fold; that is correct.

**The New-jobs rail** — this is the feature the user asked for by name.

```
container   display:flex; gap:12px; overflow-x:auto;
            scroll-snap-type: x proximity;      /* NOT mandatory — see below */
            scrollbar-width:none; id="new-jobs-rail"
card        flex:none; width:286px; scroll-snap-align:start
header      section label + amber count chip, then two 40×36 arrow buttons
            (chevron-left, chevron-right), joined (second has border-left:none)
```

Rail card contents: number strip, `map-pin` + street/area, then a row with `clock` + time and the weight
pushed right, then a full-bleed navy 60px `Take job`.

**Scrolling implementation — two traps, both hit during review:**

- `scroll-snap-type: x mandatory` **silently swallows a backward smooth programmatic scroll** in
  Chromium, so the Back arrow appeared dead while Next worked. Use `x proximity`.
- Scroll by an **absolute clamped target**, not a relative offset, and without smooth behaviour:

```js
const el = document.getElementById('new-jobs-rail');
const max = el.scrollWidth - el.clientWidth;
el.scrollTo({ left: Math.max(0, Math.min(max, el.scrollLeft + dir * 298)) });   // 298 = 286 card + 12 gap
```

In React, hold the rail in a `useRef` rather than a DOM id.

Verify by clicking Next to the far end and Back to `scrollLeft === 0`.

### 2. New (`pages/agent/AvailablePickups.tsx`)

Title `New jobs`, meta `2 free` — the number must equal what renders and must match the nav badge.

Bands **Late** then **Today**, from the existing `groupByDate()`. Each job is a full card: number strip,
name, `Place` row, a shared `Time` + `Weight` row, then a full-bleed navy 64px `Take job`. The late card
takes the `#FEF2F2` ground, `#FECACA` borders, red strip, and its time value in `#B91C1C`.

Because the screen scrolls, later-dated jobs may follow in a `Later` band of compact rows — but keep the
counts truthful when you add them.

Keep the 409 conflict handling; shorten the toast to `Someone else took it`.

### 3. My jobs (`pages/agent/MyPickups.tsx`)

Title `My jobs`, meta `3 jobs`. Bands `Today` and `Later`.

Today's jobs are separate cards, 14px apart: number strip, name 22/700, a `map-pin` + one-line address
row, then a row carrying `clock` + time 19/700, weight 17/600, and either the amber amount chip
(`padding:5px 9px`, 17/700) or `No money` 16/600 `#64748B` pushed right.

`Later` jobs are one card per job: number 19/700, then a `map-pin` line and a `calendar` line, 16/600,
with a chevron.

### 4. One job (`pages/agent/PickupDetail.tsx`)

One white scrolling sheet with a fixed action bar. Navy top bar carries the order number and status.

Body: name 28/700 (`padding:20px`), then one fact row per line at `padding:18px 20px` —
`Place` (two lines), `Time`, `Weight` + `Boxes` sharing a row, `Goes to`. Then a `Call | Map` row of two
68px halves split by a hairline (same `tel:` and Google Maps targets as today). Then the amber
`Take money` field, `margin:18px 20px 20px`, amount 28/700.

**Fixed action bar** above the nav: white, hairline top, `padding:14px 20px 16px`, `gap:10px` — amber
60px `Take ₹4,820` on its own row, then navy 60px `Picked up` beside a 112px hairline `Problem`. Buttons
still come from `entry.availableActions`; first action primary, the money action always amber.

### 5. Take money (`components/agent/CollectPaymentSheet.tsx`)

Bottom sheet, square top corners, no drag handle, `padding:20px 20px 26px`, shadow
`0 -12px 40px rgba(15,22,32,.28)`.

- Header over a 2px navy rule: order number 21/700 left, `TAKE MONEY` 13/700 uppercase right.
- `CASH OR UPI?` then two 70px halves, `gap:10px`. Selected = navy fill, white 20/700, amber icon.
  Unselected = white, `#CBD5E1` hairline. No default selection.
- `HOW MUCH?` then a 70px field with a 1px navy border: `₹` 24/600 `#64748B`, value 31/700, and a
  `FULL` reset 13/700 uppercase right.
- Amber 60px `Money taken`.
- Receipt state: amount at ~50/700 and a navy 60px `Done`. No emerald circle-check.
- **Cut:** the UPI-reference input and the transaction ID — see *Open items*.

### 6. Money (`pages/agent/Collections.tsx`)

Title `Money`, meta `Today`.

- **Amber field**, `padding:20px`: icon + `CASH WITH YOU` 13/700 uppercase, figure 50/700, then a
  divider `1px solid rgba(27,42,65,.28)` and `GIVE TO HUB TODAY` 14/700 uppercase.
- **Taken today** card: one row per collection at `padding:16px`, divided by hairlines — order number
  19/700, then a small icon (`credit-card` for cash, `smartphone` for UPI) with `Cash · 9:12 AM`
  15/500 `#64748B`, and the amount 21/700 right.
- **Cut:** the UPI-vs-cash split, the collection count, transaction IDs, the closing sentence.

### 7. My week (`pages/agent/Schedule.tsx`)

One card, seven rows, one expanded. Sub-line `Tap the times you can work.` 17/500.

- Collapsed row `padding:19px 16px`: 52px day name 18/700, then `3 times` 17/500 `#475569`, then a
  chevron. A day off reads `Off` and the row drops to `#94A3B8` with a `#CBD5E1` chevron. **Do not list
  the individual windows on a collapsed row** — a count is enough.
- Expanded row `background:#F6F8FA`: day, amber `TODAY` 13/700 uppercase, chevron-up; then a 2-column
  grid, `gap:10px`, of four 62px slots labelled `10 – 12`, `12 – 2`, `2 – 4`, `4 – 6`. Selected = navy
  fill, white 19/700, amber check. Unselected = white, `#CBD5E1` hairline.
- **Cut:** `All day` / `Copy Mon–Fri` bulk actions, the separate `Day off` button (clearing all four
  slots is the same act), the footer sentence.
- Save state: `SAVED` 13/700 uppercase `#15803D` beside the title, `SAVING` in `#64748B`. Same
  non-optimistic mutation as today.

---

## Behaviour changes (only two)

1. **Today loses its tab selector.** `Tab` state, `PanelTabs`, `chosen`/`selected` and the
   `CALLS_ON_HOME` slice go away. The screen shows the new-jobs rail, then the job in hand, then the
   cash total. It carries no date and no `Today` heading — the title is `Agent`.
2. **Nav labels change** to fit five items: `Today`, **`New`** (was Available), `My jobs`, **`Money`**
   (was Collected), `My week`. Routes unchanged — labels only.

Everything else is untouched: `availableActions` rendering, the server-owned state machine, 409
handling, IST date banding, the non-optimistic schedule save.

## Bottom nav (`components/agent/AgentNav.tsx`, `components/TabBar.tsx`)

`TabBar` is shared with the customer app, so add an optional `variant="agent"` or fork a small agent bar.

- 70px tall, `background:#1B2A41`, no shadow, no rounded pills.
- Active: white icon and label plus a **2px `#F2A123` top border** on the item.
- Inactive: `rgba(255,255,255,.6)`.
- Labels 11/600, no letter-spacing tricks, no uppercase.
- Badges: amber pill `min-width:17px; height:17px`, navy 11/700, at `top:9px; right:16–20px`. **Badge
  counts must equal what the destination screen renders.**
- Icons: Lucide 21px, stroke-width 1.5 — layout-grid, package-search, clipboard-list, wallet,
  calendar-days.

## Tokens

```
Navy (Admiralty)      #1B2A41   text, number strips, primary fills, nav
Amber (Dispatch)      #F2A123   money + next-concern icons
Screen ground         #F1F3F5
Card                  #FFFFFF
Card border           #D8DFE7
Row divider           #E8EDF2
Border strong         #CBD5E1   unselected slots, arrow buttons, Problem button
Body ink              #334155
Secondary ink         #475569   address second line, row meta
Muted ink             #64748B   section labels, title meta
Faint ink             #94A3B8   fact labels, days off, chevrons
Red ink / ground / edge   #B91C1C / #FEF2F2 / #FECACA   late only
Green (save only)     #15803D

Radius   0 everywhere on the agent surface
Spacing  6 · 10 · 12 · 14 · 16 · 18 · 20 · 22
Heights  60–68 buttons · 62 time slot · 70 payment field · 70 nav · 58 top bar · 36 rail arrow
Rail     286px card · 12px gap · 298px scroll step
Font     system-ui stack, tabular-nums
```

## Assets

- `assets/bombino-logo.png` — the repo's own `client/src/assets/bombino-logo.png`. Nothing new.
- All icons are Lucide, already a dependency. The design file hand-inlines simplified SVGs — use the
  real Lucide components at stroke-width 1.5.

## Files in this bundle

- `Agent App v4.dc.html` — **the spec.** Seven screens. Open in a browser.
- `Agent App v3.dc.html`, `Agent App v2.dc.html` — earlier passes, context only.
- `assets/bombino-logo.png`

## Files to change

```
client/src/pages/agent/Dashboard.tsx          rebuilt — tabs + date removed, title `Agent`, rail first
client/src/pages/agent/AvailablePickups.tsx   full cards per job, Take job on each
client/src/pages/agent/MyPickups.tsx          separate cards, number strips, labelled rows
client/src/pages/agent/PickupDetail.tsx       one scrolling sheet, navy top bar, fixed action bar
client/src/pages/agent/Collections.tsx        amber field + simple list
client/src/pages/agent/Schedule.tsx           one card, accordion, four slots
client/src/components/agent/PickupCard.tsx    rebuilt around the number strip + fact rows
client/src/components/agent/BandHeader.tsx    12px uppercase label; new short band names
client/src/components/agent/SlotChip.tsx      likely deleted — time is a labelled fact row now
client/src/components/agent/ActionButtons.tsx moves into the fixed bar; amber for the money action
client/src/components/agent/CollectPaymentSheet.tsx  square sheet, short copy, bigger fields
client/src/components/agent/AgentShell.tsx    scrolling column, agent top bar, navy variant for One job
client/src/components/agent/AgentNav.tsx      agent nav variant, new labels, 70px
client/src/components/TabBar.tsx              add a variant OR leave alone and fork for agent
client/src/lib/agentGrouping.ts               band names + BAND_TONE to the colour law
client/src/index.css                          agent-scoped font stack (do not touch doc-* classes)
```

Do not touch the customer pages listed in *Overview*, or the shared `doc-*` classes in `index.css`.

## Watch-outs (all three were caught in review)

- **Rail Back button.** `scroll-snap-type: mandatory` + smooth `scrollBy` = a dead Back arrow. Use
  `proximity` and an absolute clamped `scrollTo` without smooth.
- **Counts must be truthful.** Title meta, section chips and nav badges all have to agree with what
  renders after any row is cut. Two of the three review failures were mismatched counts.
- **Don't re-cram.** If a screen feels long, that is fine — it scrolls. Resist recovering space by
  shrinking padding or type; that is exactly what produced the version the user rejected.

## Open items for the team

- **`Problem`** on One job has no route or endpoint. Wire it to a hub-call action or drop it.
- **Transaction ID and UPI reference** were cut on the assumption an agent never reads them aloud. If
  ops asks agents for a txn ID by phone, put it back as a small third line on the Money row.
- ~~**Rail placement on Today**~~ — settled: the rail leads the screen, above `Doing now`.
- Per-date schedule exceptions remain out of scope, as today (`open-items.md`).
