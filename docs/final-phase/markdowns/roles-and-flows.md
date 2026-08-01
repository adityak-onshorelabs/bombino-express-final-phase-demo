# Roles and Flows

The three roles, the order lifecycle, and the end-to-end journeys — written down so both developers build against the same understanding. This is the _behaviour_ the modules have to produce.

---

## 1. The three roles

Roles live on the user record and are enforced on the server. The demo's role-switcher menu does not survive into this build.

### Customer

|                |                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Who**        | The public. Self-registered, personal or company.                                                                                                |
| **Sees**       | Their own orders only — booking, order list, order detail, tracking, notifications, profile                                                      |
| **Can do**     | Sign up, book, pay online, view their own orders, track after dispatch                                                                           |
| **Cannot**     | See anyone else's orders · reach any ops or agent screen · trigger any lifecycle action · see internal statuses, staff names, or cost breakdowns |
| **Never sees** | The words `weighed`, `settled`, `ready_for_docket`. Those are internal.                                                                          |

### Pickup Agent

|              |                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**      | Bombino field staff, on a phone, in the street                                                                                                            |
| **Sees**     | Pickups nobody has claimed · their own claimed jobs · the detail needed to do the job (address, contact, parcel, whether money is owed)                   |
| **Can do**   | Claim an unclaimed pickup · mark out for pickup · collect payment at the door if the customer chose pay-at-pickup · mark picked up · mark received at hub |
| **Cannot**   | Weigh · settle · reprice · generate a shipment · see orders that aren't theirs or aren't available · touch an order after it reaches the hub              |
| **Key rule** | Agents **self-assign**. There is no dispatcher and no assignment screen anywhere in this build.                                                           |

### Operations / Admin

|              |                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Who**      | Bombino office and hub staff                                                                                                |
| **Sees**     | Every live order, on the board, grouped by stage                                                                            |
| **Can do**   | Mark drop-offs received · weigh · reprice · collect payment at the hub · settle · generate the shipment and tracking number |
| **Cannot**   | Claim pickups on an agent's behalf · amend a shipment after it's registered with ITD (nobody can — ITD forbids it)          |
| **Key rule** | Ops is the **system of record** for every order between booking and dispatch.                                               |

### Super Admin _(only if confirmed in scope)_

Manages internal users — creates agent and ops accounts, assigns roles, deactivates leavers. Everything Ops can do, plus user management.

---

## 2. The order lifecycle

Every status, who moves it, and what the customer sees.

| #   | Status             | Moved by                                           | What just happened                               | Customer sees              |
| --- | ------------------ | -------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| 1a  | `pickup_requested` | _(system, at booking)_                             | Customer booked and asked for collection         | Pickup requested           |
| 1b  | `awaiting_dropoff` | _(system, at booking)_                             | Customer booked and will drop off themselves     | Awaiting drop-off          |
| 2   | `agent_accepted`   | **Agent**                                          | An agent claimed the job                         | Pickup confirmed           |
| 3   | `out_for_pickup`   | **Agent**                                          | Agent is on the way                              | Agent on the way           |
| 4   | `picked_up`        | **Agent**                                          | Parcel collected from the customer               | Parcel picked up           |
| 5   | `received_at_hub`  | **Agent** (pickup path) or **Ops** (drop-off path) | Parcel is physically at the hub                  | Arrived at Bombino hub     |
| 6   | `weighed`          | **Ops**                                            | Real weight recorded, price recalculated         | _(nothing — internal)_     |
| 7   | `settled`          | **Ops**                                            | Money difference resolved                        | _(nothing — internal)_     |
| 8   | `ready_for_docket` | **Ops**                                            | All checks passed, queued for registration       | _(nothing — internal)_     |
| 9   | `dispatched`       | **Ops**                                            | Registered with ITD, real tracking number issued | In transit — now trackable |
| —   | `cancelled`        | **Ops** or **Customer**                            | Order stopped before it reached the hub          | Cancelled                  |

**Three statuses are deliberately silent.** Between arriving at the hub and being dispatched, the customer sees no change. From their point of view the parcel is at the hub and nothing has happened yet. Firing notifications for weighing and settling would be noise.

**The hard gate:** an order cannot reach `ready_for_docket` unless the weight has been captured **and** the payment is satisfied. Pay-on-delivery is the single exception — it passes the payment check by design.

---

## 3. End-to-end journeys

### Flow A — Personal customer, pickup, pays online

The most common path.

| Step | Actor    | What happens                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------ |
| 1    | Customer | Opens the app, taps Create Account, chooses **Personal**                             |
| 2    | Customer | Enters phone number, receives a real SMS code, enters it                             |
| 3    | Customer | Fills in name, email, address, and Aadhaar details (format-checked, not verified)    |
| 4    | System   | Creates the Bombino account, links it to the shared retail ITD account, logs them in |
| 5    | Customer | Books: origin, destination, parcel details, **estimated** weight                     |
| 6    | Customer | Chooses **Pickup**, picks a date and a 3-hour window                                 |
| 7    | Customer | Chooses **Pay now**, completes payment through the gateway                           |
| 8    | System   | Creates a Bombino order, shows an **Order ID**. _No tracking number exists yet._     |
| 9    | Agent    | Sees the job in the available list, claims it                                        |
| 10   | Agent    | Marks out for pickup, arrives, collects the parcel, marks picked up                  |
| 11   | Agent    | Drops it at the hub, marks received at hub. **The job leaves the agent's list.**     |
| 12   | Ops      | Sees it on the board under _At Branch_, weighs it — it's 3 kg, not the 2 kg booked   |
| 13   | System   | Reprices and shows **collect ₹340 more**                                             |
| 14   | Ops      | Collects the difference, marks it settled                                            |
| 15   | Ops      | Generates the shipment — ITD returns a real tracking number                          |
| 16   | Customer | Sees **In transit**, and the order becomes trackable                                 |

### Flow B — Company customer, drop-off, pays at the hub

| Step | Actor    | What happens                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------ |
| 1    | Customer | Creates an account, chooses **Company**                                              |
| 2    | Customer | Verifies phone by SMS, enters company details and GST (format-checked only)          |
| 3    | System   | Creates a **real ITD customer** via `add_customer`, saves the identity, logs them in |
| 4    | Customer | Books, chooses **Drop-off**, chooses **Pay at drop-off**                             |
| 5    | System   | Creates the order with an Order ID. Status: _awaiting drop-off_                      |
| 6    | Customer | Brings the parcel to the hub                                                         |
| 7    | Ops      | Marks it received at hub                                                             |
| 8    | Ops      | Weighs it, price is recalculated                                                     |
| 9    | Ops      | Takes payment at the counter, marks it collected                                     |
| 10   | Ops      | Settles, then generates the shipment                                                 |
| 11   | Customer | Order becomes trackable                                                              |

**No agent is involved anywhere in this flow.**

### Flow C — Pay on delivery (COD)

Identical to Flow A or B up to settling, with one difference that matters:

| Step       | What happens                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| At booking | Customer chooses **Pay at delivery**. The order is flagged COD. No payment is taken.                 |
| At weigh   | The price is still recalculated, and the difference is still shown                                   |
| At settle  | **The order settles even though nothing has been collected.** COD passes the payment check by design |
| At docket  | The shipment generates normally                                                                      |
| Afterwards | The order stays flagged COD for the accounts team                                                    |

**COD must never block a shipment.** If a COD order gets stuck at settle, that's a bug.

### Flow D — Weight came in lower

| Step                                                | What happens                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Booked at 3 kg, paid in advance; actual weight 2 kg |                                                                                  |
| At weigh                                            | System shows **refund due ₹180**                                                 |
| At settle                                           | Ops records that a refund is owed                                                |
| This phase                                          | The refund is **flagged, not processed** — accounts handle it outside the system |
| Then                                                | The order settles and generates normally                                         |

---

## 4. When money is collected

| Method                    | Collected when         | Collected by       | Built by             |
| ------------------------- | ---------------------- | ------------------ | -------------------- |
| **Pay now**               | At booking             | Payment gateway    | Aditya               |
| **Pay at pickup**         | At the customer's door | Pickup agent       | Aditya (agent app)   |
| **Pay at drop-off**       | At the hub counter     | Ops                | Arbaaz (ops console) |
| **Pay at delivery (COD)** | Never, by us           | Nobody — flag only | Aditya               |

Three rules that apply across all of them:

1. **The amount is an estimate until the parcel is weighed.** Even a fully prepaid order can end up owing more, or being owed a refund. Everything reconciles at settle.
2. **Payment is entirely Bombino-side.** No payment information is ever sent to ITD.
3. **COD is the only method that doesn't gate the shipment.**

---

## 5. Handoff points

Three moments where an order changes hands. Each one needs to be clean and one-directional — these are where bugs will live.

| Handoff                   | From → To                   | At                | What must be true                                                                                                                                                               |
| ------------------------- | --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Booking to fulfilment** | Customer → Agent _(or Ops)_ | Order created     | The order carries everything downstream needs: consignee, pickup address, amount, pickup choice and slot, payment method, booked weight. Ops has no other source for any of it. |
| **Field to hub**          | Agent → Ops                 | `received_at_hub` | The job disappears from the agent's list and appears on the ops board. The agent can no longer act on it.                                                                       |
| **Internal to live**      | Ops → ITD                   | `dispatched`      | The shipment is registered with final values and becomes immutable. Everything before this is editable; nothing after it is.                                                    |

### Where two people can collide

| Situation                                                 | Required behaviour                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Two agents claim the same pickup at the same moment       | Exactly one wins. The other gets a clear message, not a silent failure or a double-assigned parcel. |
| Ops advances an order while the customer is looking at it | The customer's view updates without them doing anything, and a refresh shows current truth.         |
| Someone tries to generate the shipment twice              | Impossible, not merely unlikely. A duplicate shipment cannot be undone in ITD.                      |
| Two ops staff open the same order                         | Both see the same state; the second action to land reflects the first.                              |
