# Rewards & Membership: Logic (working draft)

Status: **draft, 22 Oct 2026.** This page records what has been agreed so far. Nothing here is built yet.
The first build is **UI only** (mock data, no API) in this demo repo. The UI design is still to be discussed.

Source: Bombino mail thread "Membership Rate", Ghanshyam Mishra / Pakshan Latiwala,
31 Jul 2026, forwarded by Arbaaz on 20 Oct 2026, plus clarifications from Aditya on 22 Oct 2026.

---

## 1. Who it applies to

- **Direct clients only.** Mail: "This Chart will be applicable for direct Client."
  The scheme does not cover agents, franchisees or channel partners.
- **Account holders only. Guests see nothing about rewards** (27 Oct 2026):
  no Home card, no menu or sidebar link, no points at Review & Pay or on a
  Payment due, no points line on the success screen. `/rewards` sends a guest
  to sign in (`/login?redirect=/rewards`). Verified guests with a profile count
  as guests. One check decides it: `useRewardsAccess()` in
  `client/src/lib/rewardsAccess.ts` (signed in, customer role).
- **Everyone starts at Standard.** Standard has no target to meet. It still shows
  the first milestone (₹5 L or 700 kg) as a goal, so a new customer can see
  what they are working towards.

## 2. Tier ladder

A customer moves **up** a tier when, within one year, their billing **or** their
shipped weight reaches that tier's target, whichever happens first.

| Tier | Unlocks at (yearly billing, excl. GST) | or (yearly weight) | Notes |
|---|---|---|---|
| Standard | none (starting tier) | none | Everyone starts here |
| T1 | ₹5,00,000 | 700 kg | |
| T2 | ₹10,00,000 | 1,400 kg | |
| T3 | ₹20,00,000 | 2,800 kg | |
| T4 | ₹30,00,000 | 4,400 kg | |
| T5 | **TBD** | **TBD** | Top tier, cannot go higher. Bombino has not sent the targets yet, so the targets are an assumption for now (see §6) |

A customer's tier is the **highest** tier whose value target **or** weight target they have met.

```
tier(billing, weight) = highest tier t where billing >= t.value OR weight >= t.weight
```

Example: ₹8.4 L billed and 1,620 kg shipped.
- By value, the customer only qualifies for T1 (₹5 L ≤ 8.4 L < ₹10 L).
- By weight, they qualify for **T2** (1,620 kg ≥ 1,400 kg).
- The result is **T2**, because weight reached its target first.

### Progress to the next tier

Value and weight are two separate paths, and either one completes the milestone.
Progress is shown as the further-along of the two:

```
valuePct  = billing / next.value
weightPct = weight  / next.weight
progress  = max(valuePct, weightPct)      // capped at 100%
```

Both bars should be visible, with the leading one highlighted. That makes
"whichever comes first" obvious without having to explain it.

## 3. What counts as billing

- **Billing = the final amount the customer paid**, after every adjustment. That
  includes weight corrections at the hub and any extra charges.
- **GST is excluded.** Mail: "Yearly Billing Value without Tax." Strip the tax
  before counting toward tiers or points.
- **Weight:** chargeable or actual weight is not confirmed (see §6).

## 4. Points

- **Earning: ₹100 billed (excl. GST) = 1 point.**
  `points = floor(billingExGst / 100)` per order.
- **Redemption: allowed only once the balance is at least 100 points.**
- **Value of a point when used: ₹1 off per point** (set 27 Oct 2026; it was
  ₹100). One constant, `RUPEES_PER_REDEEMED_POINT` in `lib/rewards.ts`; every
  rupee figure at checkout follows it.
  At ₹1 a member gets back about 1% of what they spend: a ₹10,000 shipment
  earns 100 points, worth ₹100 off. The 100-point minimum means points can be
  used on payments of ₹100 or more.
  ⚠️ **Still needs Bombino confirmation** (§7, question 1).
- **Using points on a payment:**
  - The most a payment can take is `min(balance, floor(amount due / value))`.
  - Points are earned on what is actually paid: amount due minus the points
    discount, excl. GST.

### Lifecycle of a booking's points (27 Oct 2026)

| Event | Points used | Points earned |
|---|---|---|
| Booking confirmed (or a due payment paid/pending) | Leave the balance now | Held as **pending** ("on the way"); not spendable, not counted to the tier |
| Points used on a due payment for an order that already has a pending earn | Leave the balance | The pending earn shrinks to what is actually paid |
| Order settles: paid and dispatched (**assumed**; see §7) | | Pending points land in the balance; the paid amount (excl. GST) and the chargeable weight count towards the tier |
| Order cancelled | **Given back** (one refund row, never twice) | Pending earn dropped |
| Session ends mid-checkout | Selection cleared, nothing taken | |

Points already used on an order at booking are taken off its Payment due too,
so a customer who closed the gateway at booking neither pays in full after
spending points nor spends points twice on the same order.

The demo figures belong to one account per device: signing in as a different
account starts that account at the default member, never someone else's balance.

## 5. Out of scope for now

- **Profit margin per tier.** The mail lists Non Member 28%, Standard 25%,
  T1 23%, T2 20%, T3 17% and T4 15%. These are ignored for now: tiers do not
  change pricing in this phase.
- **"Non Member" (28%).** The column exists in the mail, but we start everyone
  at Standard. Whether guests count as Non Member is undecided.

## 6. UI (demo build, 22 Oct 2026)

The UI runs on mock data only. Every rule above lives in `client/src/lib/rewards.ts`.
The demo state lives in `client/src/lib/rewardsStore.ts` (zustand, persisted as `bombino-rewards-demo`).

| Flow | Where | What it does |
|---|---|---|
| Discover | Home: rewards card (mobile, below the actions; desktop, top of the right rail). Plus the sidebar and side menu "Rewards" link | Shows the tier badge, % to the next tier along the closest route, and the points balance. Tapping it opens `/rewards` |
| Status | `/rewards`: tier hero | Badge, progress ring, separate billing and weight bars (the closer one is amber and tagged "Closest"), and "₹X more or Y kg more unlocks…". The top tier shows this year's totals instead |
| Journey | `/rewards`: milestone road | Standard → T5 on a rail that fills as the member progresses. Each tier shows unlocked, "You're here", or locked. The next tier shows "% there". T5 is tagged "Provisional" |
| Points | `/rewards`: wallet and activity | Count-up balance, "Worth up to ₹X off", and "+N earned" after a shipment. Under 100 points: a meter toward 100 and a locked button. At 100 or more: "Use on a booking" (→ `/create`) |
| Use at booking | Create Shipment → **Review & Pay** | "Use reward points" card under the total. Off by default; switching it on takes the most the payment allows. Adjust with −/+ (10s), a slider, or "Use max". The summary shows Total (struck through) → Reward points −₹ → **To pay**, and the button reads "Confirm Booking · ₹X". Below it: "You'll earn N points once this order settles". The success screen shows points used and points coming |
| Use on a due payment | Order → **Payment due** task | Same card. The hint shows the old amount struck through and the new amount to pay. Points come off the balance once the payment is paid or pending |
| Can't use points | Same card, switch disabled | Under 100 points: a meter and "N more points and you can use them on a payment". Payment under 100 points' worth: "Points can be used on payments of ₹10,000 or more" |
| Tier up | Full-screen celebration | Badge springs in, confetti in amber and navy, "Next up" shows the following tier. Respects reduced motion |
| Demo walkthrough | **"Rewards demo" in the sidebar / side menu** (shown to everyone, signed in or not), Demo controls → **Play the rewards demo**, or any customer URL with `?tour=rewards`. Runs as **Demo Member**, a linked account that exists only in the browser (no sign-in, no server), so its booking gets an AWB at once. The visitor's own session is put back at the end | driver.js tour (`client/src/lib/rewardsTour.ts`) that moves one step per **Next**, no timer: tier → wallet → journey → books a **dummy shipment** (25 kg Mumbai → New Jersey, 4 steps, fixed quote ₹31,860) → Review & Pay → switches points on (1,620, the whole balance) → steps down to 1,000 → **"Your turn": the presenter can use the switch, −/+, slider and "Use max" (every later figure follows their choice); the shipment form is locked** → To pay ₹30,860 by default → earn note (261 pts) → Confirm → success card with order no. and AWB → wallet 1,620 → 620 with +261 on the way → order settles, +261 lands (881) → rules. Next (or →), Look around (or Space: hides the overlay so the screen can be seen and scrolled; "Back to demo" returns), Esc/close at any time. **Nothing is booked or charged**: the booking screen runs in demo mode and never calls the API. The member's figures are saved first and put back when the tour ends, however it ends |
| Demo only | Dashed "Demo controls" panel | Switch between scenarios (New member, Close to Tier 1, Tier 2 by weight, Top tier) and "Simulate a shipment". Remove this panel when the API lands |

**Backend gap (must close before this is real):** the UI deducts points from
the demo balance, but neither `POST /api/orders` nor the pay-now endpoint
carries a points field. Razorpay is still charged the full quote. The API
needs three things:
1. `points_to_redeem` on the booking and on pay-now.
2. Validation against the balance, the 100-point minimum and the amount due.
3. The points discount taken off the gateway amount, and the redemption
   reversed if the order is cancelled.

## 7. Open questions

| # | Question | Assumed for the demo |
|---|---|---|
| 1 | What is a point worth when redeemed? (§4) **Note, 27 Oct 2026:** changed from ₹100 to **₹1** on Aditya's call. ₹100 gave back 100% of spend (a ₹31,860 booking could drop to ₹60); ₹1 gives about 1% back. Bombino to confirm the value, and whether ~1% back is what they intend | ₹1 per point; one constant (`RUPEES_PER_REDEEMED_POINT`) |
| 2 | T5 targets | Placeholder ₹50 L / 7,000 kg, kept in one constant |
| 3 | What "yearly" means: financial year (Apr–Mar), calendar year, or rolling 12 months? | Financial year, Apr–Mar |
| 4 | Does the tier drop or reset when the year ends? Do points expire? | Not shown |
| 5 | Do refunds, cancellations and RTO reduce billing and take points back? | A cancelled order gives back the points used on it and drops its pending points. Refunds after settling and RTO: not modelled |
| 6 | Does weight mean chargeable (volumetric) or actual weight? | Chargeable |
| 7 | What does redeeming do: a discount on a booking, a credit, or something else? | A discount on a payment, chosen at Review & Pay or Payment due |
| 8 | Does a higher tier earn points faster? | No, the same rate at every tier |
| 9 | Can points pay the whole amount, or must some be paid in money? | Points can cover everything (To pay ₹0) |
| 10 | When does an order "settle" so its points land: delivered, paid, or both? | Paid **and** dispatched |
| 11 | Points with Pay at Pickup / Drop-off / COD: taken at booking, or when the money is collected? | Taken at booking, like Pay Now |
| 12 | Do guest bookings count once the guest makes an account? | No; points start from the account |
| 13 | When points reduce a payment, is GST charged on the reduced amount or the full one, and what amount goes on the invoice and to ITD? (Added 27 Oct 2026) | Not decided; the demo only shows the discount |
