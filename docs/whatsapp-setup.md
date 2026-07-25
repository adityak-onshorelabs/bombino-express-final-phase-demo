# BIA on WhatsApp — Setup Requirements

What we need to take BIA (the AI support assistant) live on WhatsApp.

**Provider:** **Tata Tele Business Services — Omni** (BSP on top of Meta's WhatsApp Cloud API).
**Phase 1 scope:** inbound Q&A only — customers message the Bombino number, BIA answers with live rates, tracking, and shipping guidance. No proactive/outbound notifications yet.

Because Omni is a BSP, everything that used to be Meta-side work (System User tokens, app secrets, WABA asset roles, `messages` field subscription) is handled by Tata. We deal with **one token and one webhook URL**.

- API base: `https://wb.omni.tatatelebusiness.com`
- Panel: `https://omni.tatatelebusiness.com`
- Docs: [Session API](https://help.omni.tatatelebusiness.com/pages/session-api) · [Template & webhook docs](https://help.omni.tatatelebusiness.com/pages/api-docs)

---

## A. Credentials

Two values. Only the first comes from Tata.

| # | Name | What it is | Where to find it |
|---|---|---|---|
| 1 | `TATA_WA_TOKEN` | Omni access token — authenticates every outbound send | Omni panel → **Settings → Channels → WhatsApp** → copy Access Token |
| 2 | `TATA_WA_WEBHOOK_SECRET` | Random string **we generate**; forms the last path segment of the webhook URL | Generate: `openssl rand -hex 24` |

Optional: `TATA_WA_BASE_URL` — only set it if Tata gives us a non-default host.

**Why #2 exists.** Tata does **not** sign its webhooks (no `X-Hub-Signature-256`, no HMAC, no shared verify token). The only proof that an inbound POST really came from Omni is that the caller knows an unguessable URL. So the endpoint is:

```
POST https://<host>/api/whatsapp/webhook/<TATA_WA_WEBHOOK_SECRET>
```

Treat that whole URL like a password: vault link only, never Slack/WhatsApp/email, never in a screenshot of the Omni panel.

**Send the Omni token through a password manager or vault link.** Anyone holding it can send WhatsApp messages as Bombino Express. If it leaks, regenerate it in the panel rather than hoping it went unnoticed.

---

## B. Setup in the Omni panel

1. **WhatsApp number onboarded to Omni.** Tata runs the Meta business verification and number registration as part of onboarding. Confirm the number shows as connected under Settings → Channels → WhatsApp.

2. **Copy the access token** (A#1) and hand it over via vault link.

3. **Register the inbound webhook.** Panel → **Integration** (webhook / API settings) → set the *user messages* webhook to the URL above. Step-by-step in `docs/whatsapp-webhook-registration.md`.

   Omni exposes three webhook types — we only need **Messages** (`Receive User Messages`). *Callbacks* (sent/delivered/read/failed) and *Other Events* are not consumed in Phase 1; leave them unset or pointed elsewhere.

4. **Someone with Omni panel access reachable during the first connection test**, in case the webhook needs re-saving.

---

## C. Decisions to confirm

5. **Which number does BIA answer on?** BIA and human agents cannot share one inbox. If BIA takes the existing support number, every message to it is answered by BIA first. Note Omni also ships a **Live Chat** agent console — if Bombino wants human handover inside Omni, that is a Phase 2 conversation, not something Phase 1 does.

6. **Escalation phone number.** When BIA hands off to a human it prints a number — currently `+91 22 6640 0000`, from the app's Contact menu. Confirm it is still correct.

7. **Production host and public URL.** The webhook needs a stable public HTTPS endpoint, set as `PUBLIC_URL` on the server (used for KYC file URLs ITD fetches). Customer-facing CTAs are separate: BIA builds the "Create Shipment" deep link from `APP_URL`, which defaults to `https://app.bombinoexp.com`.

8. **Redis must be available in production.** Not optional. Webhook retries are de-duplicated in Redis; without it customers receive every answer two or three times. It also stores conversation memory — without it BIA forgets the previous message and re-asks for details.

---

## Not needed for Phase 1

- **Template approval** — templates are only required for proactive/outbound messages. BIA replies inside the 24-hour service window, which is free-form (Omni's *Session API*).
- **Customer account linking** — WhatsApp users are guests in Phase 1. BIA quotes rates, tracks any AWB, and explains the shipping process, but cannot list a customer's past orders. That needs a phone-number-to-account mapping, planned separately.
- **Meta App Dashboard access** — not used at all under the BSP model.
- **OpenAI and ITD credentials** — already configured and working.
