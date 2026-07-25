# WhatsApp / BIA Service — Deployment Brief

## What this is

The BIA WhatsApp assistant lives in the **same repo** as the main app, and — as of 2026-07-25 — runs on the **same Railway service** as the website rather than a separate one.

- **Repo:** `github.com/ak-onshore-labs/bombino-express`
- **Branch:** `aditya/whatsapp-bia`
- **Railway project:** `zucchini-gratitude` · **service:** `bombino-express`
- **URL:** `https://bombino-express-production-9e11.up.railway.app`
- **Redis:** Railway project `abundant-reprieve`, reached over the public TCP proxy (`*.proxy.rlwy.net`) since it lives in a different project
- **Build:** `npm run build` · **Start:** `npm run start`
- **Provider:** Tata Tele Omni (BSP) — see `docs/whatsapp-setup.md`
- **Host requirement:** a platform that runs a **persistent Node process** — Railway / Render / Fly / a VM. **Not Vercel** (serverless drops the after-response work the webhook depends on).

### Known trade-off of the shared service

Running the webhook alongside the website means the process holds `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ENCRYPTION_KEY` even though the WhatsApp path is guest-only and never reads them. It also shares a failure domain: BIA's tool loop takes ~13s per message on the same process that serves the site.

This was a deliberate call — one service, one `PUBLIC_URL`, lower cost. Splitting the webhook into its own service later is the mitigation if either becomes a problem; nothing in the code assumes co-location.

## Steps

1. **Set the environment variables** (list below) on the `bombino-express` service.
2. **Redeploy.** Railway does *not* restart the container when variables are set with `--skip-deploys`; a new deploy (or `railway redeploy`) is required before the process sees them.
3. **Smoke check:** `curl -i -X POST https://<url>/api/whatsapp/webhook/wrong-secret` → expect **401** (service is up, secret check working). If you get **503**, a `TATA_WA_*` var is missing from the *running* process — usually means step 2 was skipped. **200 with HTML** means the deploy is on an older build that predates the `:secret` route.

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `TATA_WA_TOKEN` | ✅ | Omni access token — Settings → Channels → WhatsApp |
| `TATA_WA_WEBHOOK_SECRET` | ✅ | Random string we generate (`openssl rand -hex 24`); becomes the last path segment of the webhook URL |
| `TATA_WA_BASE_URL` | — | Defaults to `https://wb.omni.tatatelebusiness.com`; only set if Tata gives us a different host |
| `PUBLIC_URL` | ✅ | This server's own public origin (the Railway URL), **with the scheme** (`https://…`). Only used to build KYC `file_path` URLs that ITD fetches back off us — never for user-facing links |
| `APP_URL` | — | Customer-facing app origin for CTAs. Defaults to `https://app.bombinoexp.com`; BIA builds the "Create Shipment" deep link as `APP_URL + /create`. Set only to point at staging |
| `REDIS_URL` | ✅ | Dedupe + conversation memory. Without it replies get sent two or three times |
| `OPENAI_API_KEY` | ✅ | BIA runs on `gpt-4o-mini` |
| ITD credentials | ✅ | Rates and tracking |

Webhook registration in the Omni panel happens after this and is handled with Bombino IT — not a deploy step. See `docs/whatsapp-webhook-registration.md`.

## Not deploy work — flag if not done

The service will deploy and boot fine, but **cannot send WhatsApp replies** until Bombino IT has handed over the Omni access token (`TATA_WA_TOKEN`) and registered the webhook URL in the Omni panel. Deploy can proceed in parallel; just don't expect a working send until those land.
