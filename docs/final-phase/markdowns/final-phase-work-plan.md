# Bombino Express — Final Phase Work Plan

**Timeline:** Mon 3 Aug – Sat 22 Aug 2026 (3 weeks, 6-day weeks, 18 working days)
**Team:** Aditya and Arbaaz
**Reference:** the approved demo is the look-and-feel guide for every screen

---

## 1. What we are building

Right now, Bombino Express is a booking app for one type of user. Someone at Bombino creates your account by hand, you log in, you book a shipment.

This phase turns it into a **complete courier platform with three parts**:

| Part                   | Who uses it          | What they do                                               |
| ---------------------- | -------------------- | ---------------------------------------------------------- |
| **Customer app**       | The public           | Sign up themselves, book a pickup, pay, track their parcel |
| **Pickup agent app**   | Bombino field staff  | See pickups available, claim one, collect the parcel       |
| **Operations console** | Bombino office staff | Run every order from booking through to dispatch           |

A demo of all three has been built and approved by the client. But the demo is only a set of screens — nothing works behind them. Every button is fake, nothing is saved, no real payments, no real SMS.

**Our job is to build everything behind those screens for real.**

---

## 2. The one rule that shapes the whole plan

Once a shipment is registered with ITD (our shipping partner), **it can never be changed**. The weight and the price are locked forever.

This is a problem, because when a customer books, we only have an _estimated_ weight. The real weight is only known when the parcel physically reaches our hub.

So we cannot register the shipment with ITD at booking time. Instead:

```
Customer books
      ↓
   A Bombino order is created — with an Order ID, not a tracking number
      ↓
   Parcel is picked up, or dropped off at the hub
      ↓
   Staff weigh the real parcel and settle the price difference
      ↓
   ONLY NOW do we register it with ITD and get a real tracking number
      ↓
   Customer can now track it
```

Everything before that last step lives in the **operations console**. That makes the console the most important thing we are building — it is where every order lives for most of its life.

_The full lifecycle, the roles, and the end-to-end journeys are written out in `roles-and-flows.md`._

---

## 3. How the work is divided

We split by **feature area**, not by "one does the backend and one does the frontend". Each person builds their own features completely — screens and the logic behind them.

The reason is simple: if one person builds all the logic and the other builds all the screens, the second person spends three weeks waiting for the first. Splitting by feature means **neither person is ever blocked by the other.**

#### Aditya — 6 modules, 11 days

| #   | Module                  | What it covers                                                                                                                                                           | Days |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| A1  | **App Shell & Routing** | Role-aware routing across three surfaces, route guards, per-surface navigation shells, test fixtures                                                                     | 1    |
| A2  | **Identity & Access**   | OTP provider integration, phone-based auth, personal + company signup flows, Aadhaar and GST capture (format validation only), ITD `add_customer` call on company signup | 3    |
| A3  | **Booking**             | Pickup vs drop-off toggle, date and time-slot selection, payment method selection, order creation API, Order ID generation, removal of the docket-on-booking path        | 2    |
| A4  | **Payments**            | Razorpay integration — order creation, signature verification, webhook handling — plus the COD flag and payment status tracking                                          | 1    |
| A5  | **Pickup Agent App**    | Available/assigned pickup queues, race-safe job claiming, field action flow, pay-at-pickup collection, handoff to ops at hub receipt                                     | 2    |
| A6  | **Customer Views**      | Dual-mode order/shipment list and detail, lifecycle timeline, notifications, polling for live status, post-AWB tracking handover                                         | 2    |

#### Arbaaz — 7 modules, 11 days

| #   | Module                          | What it covers                                                                                                                                                                                               | Days |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| M1  | **RBAC & Access Control**       | Role on the user record, `requireRole` middleware, backend-enforced permissions on every ops and agent route, 403 handling, config endpoints, plus a full hardening sweep in week 2                          | 1.5  |
| M2  | **Ops Console**                 | Order board grouped by lifecycle phase — kanban on desktop, grouped list on mobile — order detail drawer, and a generic action renderer driven by server-computed available actions                          | 2.5  |
| M3  | **Weigh & Settle**              | Weight capture, repricing engine, delta calculation (collect more / refund due / no change), settle guards, payment satisfaction checks, pay-at-drop-off collection, reconciliation against advance payments | 3    |
| M4  | **ITD Integration**             | `add_customer` API wrapper, dual auth schemes (session token vs static bearer), all ITD constants moved to env config, hub reference table, docket attribution resolution                                    | 1    |
| M5  | **Docket & AWB Generation**     | `create_docket` call using final settled values, AWB persistence, shipment record creation, double-fire guard, ready-for-docket and AWB reveal UI                                                            | 1    |
| M6  | **Status Sync**                 | Customer-facing status derivation, notification fan-out on each transition, audit logging, silence on internal-only transitions                                                                              | 1    |
| M7  | **Super Admin** _(conditional)_ | Internal user and role management — pending scope confirmation                                                                                                                                               | 1    |

**Shared foundation (Day 1, both):** the order data model and database schema, the lifecycle state machine, the uniform action endpoint, the shared type contract between client and server, and the repository restructure that lets two people work without colliding.

**Day 1 is the only day we work together.** After that we split for two weeks.

**In the whole three weeks there is only one point where one of us waits for the other:** Aditya's company sign-up needs Arbaaz's ITD connection. Arbaaz finishes it on Day 4; Aditya needs it on Day 6. Two days of breathing room.

---

## 4. What each person is building

### Aditya's areas

**Sign up and login** _(3 days)_
Today Bombino creates accounts by hand. Now anyone can sign up themselves: enter a phone number, get a real SMS code, choose Personal or Company, fill in details, and start booking within a couple of minutes. Personal customers give their Aadhaar details; companies give GST details. We check the format of both but do not verify them with the government — that was agreed as out of scope. Identity details are collected once at sign-up and never asked for again.

**Booking a shipment** _(2 days)_
The booking screens already exist and work well, so this is an extension, not a rebuild. Two additions: the customer chooses whether we collect the parcel or they drop it off (and if we collect, picks a date and a 3-hour time window), and they choose how they want to pay. The big change is what happens on submit — instead of creating a tracking number immediately, it now creates a Bombino order and shows an **Order ID**. The tracking number comes later, from operations.

**Taking payment** _(1 day)_
Four ways to pay, chosen at booking: pay now online, pay when we collect, pay at the hub, or pay on delivery. This covers the online payment gateway and the pay-on-delivery flag. The two "pay in person" options are built into the agent app and the operations console, because that's where staff actually press the button. Payments are entirely Bombino's side — ITD is not involved in money at all.

**The pickup agent app** _(2 days)_
A phone app for the person on the bike. They see pickups nobody has taken, claim one, and work through a few simple steps as they do the job — heading out, collected, dropped at hub. If the customer chose to pay at pickup, they take the money at the door. Once they drop the parcel at the hub, the job leaves their list and the office takes over. It has to work one-handed, on a phone, on a street.

**The customer's order screens** _(2 days)_
What the customer sees after booking. The tricky part is that an order changes character partway through: before it's registered with ITD it's a Bombino order with no tracking number, and afterwards it's a real trackable shipment. The same screens need to handle both and switch over automatically. It also needs to update on its own when the office does something, so the customer isn't refreshing and seeing stale information.

**Three apps in one** _(1 day)_
The plumbing that makes one app behave as three. A customer, an agent and an office staff member open the same address and land in what feel like completely different apps. Built first, because everything else needs somewhere to sit.

### Arbaaz's areas

**Who is allowed to do what** _(1.5 days)_
The demo let anyone switch roles from a menu. Now roles are real: a customer genuinely cannot reach or trigger anything in the operations console or the agent app, even if they know the address. This is checked on the server, not just hidden on screen. Half of this is done up front and half is a deliberate check-everything pass late in the schedule, once all the screens exist.

**The operations board** _(2.5 days)_
The main internal screen. Staff see every live order sorted into the stage it's at — waiting for pickup, at the branch, ready to settle, ready to dispatch, done. They click an order and act on it. A board layout on desktop, since staff work on laptops, and a clean grouped list on phones. Older shipments from before this phase sit in a separate collapsed group so they don't get in the way.

**Weighing and settling payment** _(3 days)_
The commercial heart of the whole project. Staff put the parcel on the scale and enter the real weight. The system recalculates the price and shows the difference clearly — **collect more**, **refund due**, or **no change**. An order cannot move forward until the weight is recorded and the money is sorted. This also covers customers who pay at the hub when dropping off. Pay-on-delivery is the exception: we never collect it, it's simply flagged for the accounts team, and it must not hold anything up.

**Connecting to ITD** _(1 day)_
All the plumbing to our shipping partner's system, including registering new company customers with them. Also pulling all the ITD-specific settings out of the code and into configuration, because a few of those values are still being confirmed by Anas and we don't want to be waiting on them.

**Creating the shipment and tracking number** _(1 day)_
The final, irreversible step. Once weight and payment are settled, the order is registered with ITD and gets a real tracking number. From here the customer can track it properly. Most of the machinery for this already exists — the work is moving it from happening at booking to happening at the end.

**Keeping the customer informed** _(1 day)_
Translating what staff do into what the customer sees. When an agent accepts a job, the customer sees "Pickup confirmed". When it reaches the hub, they see "Arrived at Bombino hub". The internal steps — weighing, settling — deliberately show nothing, because from the customer's point of view nothing has happened yet. Every action also gets recorded so we know who did what.

**Managing staff accounts** _(1 day — only if approved)_
Creating agent and office-staff accounts and assigning their roles. This has not been confirmed as in scope. If it isn't, this day becomes spare time — which, given how tight the rest is, would not be a bad thing.

---

## 5. Week by week

Preparation to be done before Monday is in `day-zero-checklist.md`.

### Week 1 — Mon 3 to Sat 8 August

| Day | Aditya                                                                                                          | Arbaaz                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Mon | **Together:** agree the foundations — what an order is, its stages, who can do what, and the database structure |                                               |
| Tue | Three apps in one — the app skeleton                                                                            | Who is allowed to do what                     |
| Wed | Sign up: phone number and SMS code                                                                              | The operations board — layout and order cards |
| Thu | Sign up: personal accounts                                                                                      | Connecting to ITD                             |
| Fri | Booking: pickup choice, time slots, payment choice                                                              | Operations board — order detail and actions   |
| Sat | Sign up: company accounts                                                                                       | Weighing — entering the real weight           |

### Week 2 — Mon 10 to Sat 15 August

| Day | Aditya                                          | Arbaaz                                        |
| --- | ----------------------------------------------- | --------------------------------------------- |
| Mon | Booking: creating the order and Order ID screen | Settling — showing the price difference       |
| Tue | Customer's order list and progress screens      | Collecting payment at the hub                 |
| Wed | Online payment                                  | Creating the shipment and tracking number     |
| Thu | Pickup agent app — the job list                 | Keeping the customer informed                 |
| Fri | Pickup agent app — doing the job                | Checking every screen is properly locked down |
| Sat | Tracking handover and polish                    | Staff accounts, or spare time                 |

### Week 3 — Mon 17 to Sat 22 August

Both of us, working together. **No new features this week** — this is entirely putting the two halves together and making sure it works.

| Day | Focus                                                                                         |
| --- | --------------------------------------------------------------------------------------------- |
| Mon | Connect both halves and fix anything that doesn't line up                                     |
| Tue | Test the full journey: personal customer, pickup, pay online, weigh, settle, dispatch         |
| Wed | Test the other journeys: company customer dropping off and paying at the hub; pay-on-delivery |
| Thu | Awkward cases: refunds, cancellations, permissions, two people looking at the same order      |
| Fri | Put in the final ITD settings once confirmed by Anas                                          |
| Sat | Fix remaining bugs, go live, hand over                                                        |

---

## 6. What we need from others

Nothing here stops us starting, but each one blocks a specific day if it doesn't arrive.

| What we need                                                       | Needed by     | Who to ask |
| ------------------------------------------------------------------ | ------------- | ---------- |
| **How we register a shipment on behalf of a customer** — see below | **Thu 6 Aug** | Anas       |
| SMS provider and account details                                   | Wed 5 Aug     | Bombino    |
| ITD access token for creating customers                            | Thu 6 Aug     | Anas       |
| Login details for the shared personal-customer ITD account         | Thu 6 Aug     | Anas       |
| Which branch a new customer gets assigned to                       | Thu 6 Aug     | Bombino    |
| Decision: refunds handled manually or through the payment gateway? | Mon 10 Aug    | Bombino    |
| Payment gateway confirmation and keys                              | Wed 12 Aug    | Bombino    |
| Confirmation of the correct shipment-creation details              | Wed 12 Aug    | Anas       |
| Is staff account management in scope?                              | Sat 15 Aug    | Bombino    |

**Already answered** from the customer creation document Anas sent: the company identifier, the location code format, and the full branch list. That's three questions closed.
