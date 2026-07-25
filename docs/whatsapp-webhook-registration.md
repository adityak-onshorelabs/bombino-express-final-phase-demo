# Connecting WhatsApp to BIA — Tata Omni Panel Setup

For the Bombino team. This points our Omni WhatsApp number at the BIA service so
incoming customer messages get answered.

You will be given **one value** by the dev team:

| You need | Shape |
|---|---|
| **Webhook URL** | `https://<given-to-you>/api/whatsapp/webhook/<long-random-string>` |

The random string on the end is a secret — it is what proves to our server that
the request came from Omni. **Do not shorten it, do not share the URL outside
the panel, do not paste it into chat.**

There is no verify token and no "Verify and Save" handshake — Tata's platform
does not use one.

---

## Steps (in the Omni panel)

### 1. Log in
Go to [omni.tatatelebusiness.com](https://omni.tatatelebusiness.com) and sign in.

### 2. Open webhook settings
Left sidebar → **Integration** (webhook / API configuration).
If it isn't there, check **Settings → Channels → WhatsApp** — panel layouts vary
by account.

### 3. Set the *user messages* webhook
Paste the full URL the dev team gave you into the webhook for
**incoming / user messages**. Save.

Omni lists up to three webhook types:

| Type | Set it? |
|---|---|
| **Messages** (incoming user messages) | ✅ Yes — this is the one |
| **Callbacks** (sent / delivered / read / failed) | ❌ Leave as is |
| **Other Events** | ❌ Leave as is |

### 4. Grab the access token (dev team needs this)
**Settings → Channels → WhatsApp** → copy the **Access Token** and send it to the
dev team **via a password manager or vault link** — not WhatsApp, Slack, or email.

---

## Test it
Send a WhatsApp message to the Bombino business number. BIA should reply within
a few seconds.

- **No reply at all** → recheck the webhook URL for a truncated or altered random
  string, then tell the dev team.
- **Reply arrives two or three times** → tell the dev team; that's a server-side
  Redis issue, not a panel setting.
