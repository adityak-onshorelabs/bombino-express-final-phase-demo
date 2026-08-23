# WhatsApp — what Bombino has to do

The app side is built and tested. Everything below sits in the Tata Tele Omni
panel or with Meta, and none of it can be done from the codebase.

**The short version: nothing sends until the seventeen templates in
`whatsapp-templates.md` are approved.** That is the only true blocker; the rest
is confirmation and housekeeping.

Follows the `open-items.md` §2 convention — one row per item, with who to chase
and what breaks until it lands.

---

## 1. Already done — do not redo

Confirmed from the credentials in hand.

| Item | Evidence |
|---|---|
| WABA connected to Tata Omni as a BSP channel | `TATA_WA_TOKEN` is a live JWT, `scope: ["whatsappBSP"]`, botId `6a1d3576…ced2`, issued 21 Jul 2026 |
| API token issued | Same. **No `exp` claim — it does not expire on its own**, so treat it as a permanent password, not a session |
| Webhook URL registered in the panel | `TATA_WA_WEBHOOK_SECRET` matches the path segment the panel was given: `https://bombino-express-production-9e11.up.railway.app/api/whatsapp/webhook/<secret>` |

The webhook URL was registered before the endpoint existed. **It exists now** —
so receipts start landing the moment the first message goes out, with no change
needed at their end.

---

## 2. Blocking — nothing sends until these land

| # | Item | Who | Why it blocks |
|---|---|---|---|
| 2.1 | **Submit all 17 templates for approval, in one batch** | Bombino, in the Omni panel | Every message is business-initiated, so every one needs a pre-approved template. Free-form text is only legal inside a 24-hour window opened by an inbound customer message, and we are send-only, so that window never exists. Bodies are in `whatsapp-templates.md`, ready to paste |
| 2.2 | Build `bombino_login_otp` via the panel's **Authentication** flow, not as a Utility template | Bombino | The preset is what produces the copy-code button. `server/whatsapp.ts` sends a button parameter, and a template without that button rejects the send. Set expiry to **5 minutes** to match `OTP_TTL_MINUTES` |
| 2.3 | Send back the **exact approved template names** | Bombino → Aditya | They must match `WA_TEMPLATE` in `server/whatsappTemplates.ts` character for character. A mismatched underscore is a `failed` row and a message nobody receives |

Approval is 1–2 days per template and rejections come back on wording. Submitted
one at a time this is a fortnight; submitted together it is a couple of days.
**This is the critical path and the only thing on it.**

---

## 3. Needed from Tata / Anas — answers, not work

**Two of these are now closed.** Their OpenAPI spec is public at
`help.omni.tatatelebusiness.com/openapi/openapi.json`, and it settled the send
contract without anyone having to ask — see §8 for what it changed.

| # | Question | Who | Status |
|---|---|---|---|
| 3.1 | ~~The send endpoint's exact path and payload~~ | — | **Answered by their spec.** `POST /whatsapp-cloud/messages`, body shape confirmed field by field. Three bugs found and fixed on our side — §8 |
| 3.2 | ~~Confirm the base URL~~ | — | **Confirmed.** `https://wb.omni.tatatelebusiness.com` is the only server in their spec |
| 3.3 | The **display name** customers will see, and whether it is verified | Bombino | **Outstanding.** An unverified sender shows a raw phone number instead of "Bombino Express". Not blocking, but it changes whether people trust the first message they ever get from us — which is the login code |
| 3.4 | Current **messaging tier** (1K / 10K / 100K unique recipients per 24h) | Bombino | **Outstanding.** The agent new-job fan-out sends one message per rostered agent, so the number climbs with the field team rather than with orders |

The number-check question is closed too, in the unhelpful direction: their spec
has no contact-validation endpoint. The receipt-driven SMS fallback is the
answer, and it is built.

---

## 4. Policy — needed before real customers, not before testing

| # | Item | Who | Note |
|---|---|---|---|
| 4.1 | **Opt-in wording at signup.** India requires prior opt-in for business-initiated messages | Bombino to approve the wording, Aditya to add it | Suggested: a line at signup saying order updates and the login code arrive on WhatsApp. Phone verification already happens by WhatsApp OTP, which is itself a strong opt-in signal, but the written consent is what an audit asks for |
| 4.2 | Confirm **STOP is honoured** and who monitors it | Bombino | Already built: an inbound `STOP` sets `whatsapp_opt_out` on the account and every send checks it. Without it the only exit a customer has is blocking the number, which counts against the quality rating and takes every other Bombino message down with it |
| 4.3 | ~~Decide what happens to a customer with no WhatsApp~~ — **decided: SMS fallback.** Now needs §7 | Bombino | The app tries WhatsApp, and falls back to SMS when the delivery receipt says undeliverable. Built and tested. It cannot actually send until §7 lands |
| 4.4 | Who answers if a customer **replies** to a message | Bombino | We are send-only. Replies land in the Omni panel's agent inbox and nobody is watching it. A customer replying "where is my parcel" into a void is worse than not messaging them |

---

## 5. Deployment — Aditya's side, listed so nothing falls between us

| # | Item | Note |
|---|---|---|
| 5.1 | Set `WA_DRY_RUN=0` on Railway | Defaults to on in development. Until this flips, every send is logged and skipped |
| 5.2 | Set `WA_CRON_SECRET` on Railway | The agent digest and slot reminders 404 without it |
| 5.3 | Two Railway cron jobs against `POST /api/internal/wa/agent-schedule` | `?kind=digest` once early (07:00 IST = 01:30 UTC); `?kind=reminders` every 15 minutes. Both are deduped, so running either more often is harmless |
| 5.4 | Confirm `PUBLIC_URL` still matches the registered webhook host | It is the host in the URL Tata already has. If the Railway domain changes, the webhook registration has to change with it |

---

## 6. Once live — what to watch

```sql
select template, status, count(*)
from whatsapp_messages
group by 1, 2
order by 1, 2;
```

| Symptom | Means |
|---|---|
| `failed` rising on one template | It was paused or rejected after approval |
| `failed` rising across all templates | The WABA's quality rating has dropped, or the token was revoked |
| `skipped` everywhere | `WA_DRY_RUN` is still on, or the token is unset. Not a fault |
| `sent` but never `delivered` | Receipts are not arriving — check the webhook registration first |

The quality rating is the thing to protect. Two decisions already defend it: the
new-job message goes only to agents rostered for that window rather than to
everyone, and `STOP` is honoured in code. A third is Bombino's: do not add
promotional messages to this number.

---

## 7. SMS — new, and now on the critical path

The login OTP goes over WhatsApp with an SMS fallback, because phone is the
only credential in this app: a customer whose code does not arrive cannot log
in and cannot sign up. The common case is not "no WhatsApp" at all — it is a
**dual-SIM customer whose WhatsApp lives on their other number**, and that is
common enough to design for.

The fallback is built and tested. It cannot send anything until all four of
these land, and the first three are Bombino's.

| # | Item | Who | Note |
|---|---|---|---|
| 7.1 | Choose an SMS provider | Bombino | Not chosen. MSG91, Gupshup and Kaleyra all handle Indian DLT as part of onboarding, which is worth more here than API elegance |
| 7.2 | **TRAI DLT registration** — Bombino as a Principal Entity | Bombino | A regulator process, not a vendor one. Days, not hours |
| 7.3 | A 6-character **sender ID**, registered and approved | Bombino | e.g. `BMBNOX`. Goes in `SMS_SENDER_ID` |
| 7.4 | The OTP **SMS template** registered on DLT | Bombino | Separately from the WhatsApp one — same words, different regulator. **An unregistered template is dropped by the operator with no receipt**, which looks identical to a working system doing nothing. Text is in `SMS_OTP_TEMPLATE`, `server/sms.ts` |
| 7.5 | Wire the vendor call | Aditya | One marked gap in `server/sms.ts`. An hour once 7.1–7.4 exist |

Run 7.2–7.4 **in parallel with the WhatsApp template approvals** in §2. They are
independent queues at two different bodies, and running them one after the other
doubles the wait for no reason.

### One question for Tata, while you are asking them things

Does the Omni API expose a **"is this number on WhatsApp" check**? Meta's Cloud
API does not — the On-Premises `/contacts` endpoint was removed deliberately,
because it lets anyone enumerate numbers. If Tata expose one of their own it
saves about twelve seconds on the fallback path, which is worth having.

It does not replace anything: a number can pass a pre-check and still fail to
receive, so the receipt fallback stays either way. Nice to have, not blocking.

---

## Security note

`TATA_WA_TOKEN` never expires. It is a permanent bearer credential that can send
messages as Bombino to anyone. It currently sits in plaintext in a local
`docs/whatsapp.env` — gitignored and untracked, so it is not in version control,
but it has been passed around by whatever means it reached us. **Rotate it in
the Omni panel once and set the new value straight into Railway**, rather than
treating the current one as safe because it has not leaked yet.

---

## 8. What their API spec changed on our side

Their OpenAPI document is public and needed no login:
`https://help.omni.tatatelebusiness.com/openapi/openapi.json`

Reading it confirmed the endpoint, the host and the authentication-template
payload exactly as built — and exposed **three defects that would each have
shipped silently**. All three are fixed and tested against the payload examples
in their own spec.

| What was wrong | What it would have caused |
|---|---|
| We matched delivery receipts on the id returned when sending. That id is Tata's **request id**; receipts carry a Meta **`wamid`** instead — different id spaces, so no receipt would ever have matched | Every receipt discarded as unknown. No delivery visibility at all, and — worse — **the OTP SMS fallback would never have fired**, because it waits for a receipt to report failure. The dual-SIM customer §7 exists for would have got nothing, silently |
| Inbound messages arrive as a bare **object**; we only read the array shape Meta uses | `STOP` never registering. Opt-out silently dead, and the only exit left to a customer would have been blocking the number — which damages the quality rating for everyone |
| No correlation id was sent at all | Nothing to fix the first problem with |

The fix for all three is one mechanism their API already provides:
`metaData.custom_callback_data` is sent with each message and handed back on
every receipt. We now send our own message-row id there — not the deduplication
key, which carries a phone number and, for a pickup message, the customer's
four-digit handover code. Neither belongs in a field that travels out to Meta
and back.

**Nothing here needs anything from Bombino.** It is recorded because "we
verified the integration against the vendor's own specification" is worth
knowing, and because it is the reason §3.1 and §3.2 are closed.
