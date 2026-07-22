# BIA on WhatsApp — Setup Requirements

What we need from the Bombino IT team to take BIA (the AI support assistant) live on WhatsApp.

**Provider:** Meta WhatsApp Cloud API, direct (no BSP/reseller).
**Phase 1 scope:** inbound Q&A only — customers message the Bombino number, BIA answers with live rates, tracking, and shipping guidance. No proactive/outbound notifications yet.

The application code is complete and tested end-to-end against the **live** Meta Graph API. Everything below is external configuration we cannot create ourselves.

---

## Current status (2026-07-22)

Credentials received and validated against live Graph API:

| Check | Result |
|---|---|
| Access token | ✅ Valid — permanent System User token, never expires |
| Token scopes | ✅ `whatsapp_business_messaging` + `whatsapp_business_management` present |
| Phone number ID | ✅ Resolves to "Bombino Express Pvt Ltd", quality GREEN |
| Webhook signature | ✅ Verified with the real app secret |
| BIA reply generation | ✅ Working (live rates + tracking) |
| **Sending a message** | ❌ **Blocked** — see item 3 below |

**One blocker remains.** Sending fails with `(#200) You do not have the necessary permissions to send messages on behalf of this WhatsApp Business Account`. The token is valid and has the right scopes, but the System User has not been granted access to the WABA *asset*. This is fixed entirely in Meta Business Settings — Section B, item 3. No code change needed once done.

---

## Required — in order

Everything above the line is done. These are the only open items, in the order to do them. Items 1 and 2 are independent — they can be done in parallel.

| Order | Item | Owner | Blocks | Detail |
|---|---|---|---|---|
| **1** | **Grant System User the WABA asset role** | Bombino IT | Sending — the current blocker | Section B, item 3 |
| **2** | **Stand up a public HTTPS host + set `PUBLIC_URL`** | Us / Bombino IT | The webhook (item 3) and the "Create Shipment" link | Section C, item 8 |
| **3** | **Register the webhook** (needs the URL from item 2) | Whoever holds Meta app admin | Receiving messages | Section B, item 4 |
| **4** | **Redis running in production** | Bombino IT / infra | De-dupe + conversation memory | Section C, item 9 |
| **5** | **Confirm the two decisions** — which number, escalation phone | Bombino | Nothing technical; needed before launch | Section C, items 6–7 |
| **6** | **Handset connection test** | Us + a Meta admin | Go-live sign-off | Section B, item 5 |

**Does `PUBLIC_URL` come first?** No. It is *not* needed for item 1 (the asset grant) — those are independent tracks. `PUBLIC_URL` only matters from item 3 onward: the webhook callback URL and `PUBLIC_URL` are the same public host, so that host must exist before the webhook can be registered. Start item 1 immediately; stand up the host in parallel.

---

## A. Credentials — ✅ all received and validated

Four values. The first three are secrets; the fourth we generate and hand over.

| # | Status | Name | What it is | Where to find it |
|---|---|---|---|---|
| 1 | ✅ | `WHATSAPP_TOKEN` | Permanent **System User** access token | Business Settings → Users → System Users → Add → Generate token → select the WhatsApp app → expiry **Never** |
| 2 | ✅ | `WHATSAPP_PHONE_NUMBER_ID` | Numeric ID of the sending number — *not* the phone number itself | App Dashboard → WhatsApp → API Setup |
| 3 | ✅ | `WHATSAPP_APP_SECRET` | App secret; verifies that incoming webhooks genuinely come from Meta | App Dashboard → App settings → Basic → App secret → Show |
| 4 | ✅ | `WHATSAPP_VERIFY_TOKEN` | Arbitrary shared string; must match on both sides | **We generated this** (`bombinoexp-whatsapp-bia-2026`) — it goes into the webhook config (Section B) |

Required token scopes for #1: `whatsapp_business_messaging` and `whatsapp_business_management` — both confirmed present.

### Two warnings

**The token on the API Setup page is a temporary 24-hour test token.** If that one is sent, WhatsApp stops working the next day with no obvious error. It must be a System User token with expiry set to Never.

**Send items 1–3 through a password manager or vault link — not WhatsApp, Slack, or plaintext email.** Anyone holding `WHATSAPP_TOKEN` can send messages as Bombino Express. If it is ever pasted into a chat or committed to a repo, revoke and regenerate it rather than hoping it went unnoticed.

---

## B. Setup on the Meta side

1. ✅ **WhatsApp Business Account (WABA) created, and the Meta Business account verified.** *(Done — verified as "Bombino Express Pvt Ltd".)*
   Business verification can take several days and gates everything else — worth starting before anything on this list.

2. ✅ **A phone number registered to the WABA.** *(Done — `+91 1800 266 6401`, quality GREEN.)*
   If the number is already in use in the WhatsApp Business *app*, it must be deleted or migrated there first. A number cannot be active in both places at once.

3. **⚠️ Grant the System User access to the WhatsApp Account asset.** *(OPEN — this is the current blocker.)*
   Having the token scope is not enough — the System User must also be assigned to this specific WABA with a messaging role.

   | What | Where |
   |---|---|
   | Assign System User → WhatsApp Account, **Full control / Manage** | Business Settings → Users → System Users → *[select the user]* → Add Assets → WhatsApp Accounts → tick the account → enable **Full control** → Save |
   | Confirm the app is added to the WABA | Business Settings → Accounts → WhatsApp Accounts → *[select account]* → Apps → the app (`2076778249625474`) must be listed |

   Symptom if skipped: sends fail with error `(#200) You do not have the necessary permissions...`, even though reading the number and validating the token both succeed.

4. **Webhook configured** (App Dashboard → WhatsApp → Configuration):
   - Callback URL: we provide this (`https://<host>/api/whatsapp/webhook`)
   - Verify token: the value from A#4
   - Subscribe the **`messages`** field

   Please confirm who does this step: either grant us Developer/Admin role on the Meta app and we configure it, or you configure it and we hand over the URL and token.

5. **Someone with app admin access reachable during the first connection test.**
   The webhook handshake commonly needs a retry or two, and the error messages on the Meta side are only visible to admins.

---

## C. Decisions we need confirmed

6. **Which number does BIA answer on?**
   The existing support number (`+91 70459 99553`) or a new one? Important: BIA and human agents cannot share one inbox. If BIA takes the existing number, every message to it is answered by BIA first.

7. **Escalation phone number.**
   When BIA hands off to a human, it prints a number. Currently `+91 22 6640 0000`, taken from the app's Contact menu. Confirm this is still correct.

8. **Production host and public URL.**
   The webhook needs a stable public HTTPS endpoint. We also need `PUBLIC_URL` set on the server — BIA uses it to build the "Create Shipment" deep link in rate replies.

9. **Redis must be available in production.**
   Not optional for this feature. Meta retries webhook deliveries aggressively; Redis is what de-duplicates them. Without it, customers receive every answer two or three times. It also stores conversation memory — without it BIA forgets the previous message and re-asks for details.

---

## Not needed for Phase 1

- **Message template approval** — only required for proactive/outbound notifications (e.g. pushing shipment status updates), which is out of scope for now.
- **Customer account linking data** — WhatsApp users are treated as guests in Phase 1. BIA can quote rates, track any AWB, and explain the shipping process, but cannot list a customer's past orders. That requires a phone-number-to-account mapping, planned separately.
- **OpenAI and ITD credentials** — already configured and working.

---

The ordered open items are in the **"Required — in order"** section near the top. Estimated time once the asset grant (item 1) is done: under a day.
