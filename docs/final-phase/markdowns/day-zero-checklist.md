# Day 0 — Checklist Before We Start

Everything to be done before Monday 3 August. Day 1 is the only day both developers are coupled, so anything that can be done beforehand should be.

**Companion documents**

- `roles-and-flows.md` — the three roles, the order lifecycle, and the end-to-end journeys
- `final-phase-work-plan.md` — the schedule and the work split
- `final-phase-modules.md` — the technical build spec for each module

---

## 1. Chase these now — they block specific days

| What | Blocks | Ask | Chase by |
|---|---|---|---|
| **How do we tell ITD which customer a shipment belongs to?** (see §4) | Docket generation, company signup design | Anas | **Today** |
| SMS/OTP provider decision + account credentials | Signup, Day 3 | Bombino | Fri 31 Jul |
| Production bearer token for the ITD customer API | ITD integration, Day 4 | Anas | Fri 31 Jul |
| Login credentials for the shared personal-customer ITD account | Signup, Day 4 | Anas | Fri 31 Jul |
| Which hub/branch a new customer is assigned to, and which hubs to expose | ITD integration, Day 4 | Bombino | Fri 31 Jul |
| Payment gateway confirmed (Razorpay?) + test keys | Payments, Day 9 | Bombino | Wed 5 Aug |
| Confirmed working `create_docket` payload | Docket generation, Day 9 | Anas | Wed 5 Aug |
| Is Super Admin in scope? | Day 12 | Bombino | Anytime before Day 12 |

**Already answered** by `CUSTOMER CREATION API DETAILS.txt`: company id (2), location code format, the 24-hub table, and the full `add_customer` payload shape.

---

## 2. Environment setup — both developers

| Task | Owner |
|---|---|
| Clone, `npm install`, `npm run dev` on :5000, confirm the app loads | Both |
| Confirm Supabase SQL access works — run a `SELECT` against an existing table | Both |
| Confirm `.env` is complete and the ITD sandbox responds | Both |
| Confirm `npm run check` passes clean on `main` before we start | Both |
| Agree branch naming: `<name>/<module-id>-<slug>`, e.g. `arbaaz/m2-ops-console` | Both |
| Agree that `main` stays deployable — module branches merge only when their module's definition of done passes | Both |

---

## 3. Repo housekeeping

| Task | Owner |
|---|---|
| Move `CUSTOMER CREATION API DETAILS.txt` into `docs/` and commit it | Either |
| Commit the planning docs in `docs/` | Either |
| Remove `aditya-kamarouthu-bank-details.pdf` from the repo root — it should not be in version control | Aditya |
| Update `CLAUDE.md` — it currently claims no routes exist and the DB isn't wired, both false | Either |

---

## 4. The one open architectural question

When we register a shipment with ITD, **their system decides which customer it belongs to based on whose login made the call.** That worked before, because customers booked their own shipments.

In the new model, our ops staff create the shipment days later on the customer's behalf. And the `add_customer` API creates no login and returns no customer id — its response just echoes back what we sent.

So: **how do we tell ITD which customer a shipment belongs to?**

Three possible answers, all workable:

1. The shipment creation call accepts a customer code or id alongside our company login. *(Most likely — the rate calculation API already takes a customer code.)*
2. `add_customer` can also create login credentials, which we store per customer. *(The codebase already has encryption and per-user token storage for exactly this.)*
3. Every shipment is created under the Bombino account, and customer attribution stays on our side only. *(Simplest; loses per-company billing inside ITD.)*

**This does not block the start.** We build the shipment call to take customer identity as a parameter, and whichever answer comes back drops in. But it should be answered before Day 4.

---

## 5. Decisions to close before Day 1

| Decision | Default if undecided |
|---|---|
| Refunds — gateway refund or manual with a flag? | **Manual with a flag.** Gateway refunds add reconciliation work there's no room for |
| Repricing at weigh — fresh rate call, or stored rate card? | **Fresh rate call**, falling back to the booked quote if it fails |
| Do we support order cancellation, and from which states? | **Yes**, from any state before `received_at_hub` |
