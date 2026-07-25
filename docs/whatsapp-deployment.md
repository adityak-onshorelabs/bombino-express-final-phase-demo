# WhatsApp / BIA Service — Deployment Brief

## What this is

The BIA WhatsApp assistant lives in the **same repo** as the main app. We deploy that repo a **second time** as its own service — separate container, separate Redis, separate failure domain from the website at `bombino.onshorelabs.co.in`.

The service runs the whole app but only one route ever receives traffic: `POST /api/whatsapp/webhook/:secret`. Everything else is dormant by design. **This is intentional — do not try to strip the repo down.** The isolation comes from it being a separate service, not from removing code.

- **Repo:** `github.com/ak-onshore-labs/bombino-express`
- **Branch:** `aditya/whatsapp-bia`
- **Build:** `npm run build` · **Start:** `npm run start`
- **Provider:** Tata Tele Omni (BSP) — see `docs/whatsapp-setup.md`
- **Host requirement:** a platform that runs a **persistent Node process** — Railway / Render / Fly / a VM. **Not Vercel** (serverless drops the after-response work the webhook depends on).

## Steps

1. **Create a new service** from the repo above, branch `aditya/whatsapp-bia`. Same build/start commands as the main app.
2. **Add a Redis instance** to this service — its own, not shared with the website.
3. **Set the environment variables** (list below).
4. **Point the subdomain** at this service (e.g. `bia.bombino.onshorelabs.co.in`). Deploy.
5. **Take the service's URL, set `PUBLIC_URL` to it, redeploy.**
6. **Smoke check:** `curl -i -X POST https://<url>/api/whatsapp/webhook/wrong-secret` → expect **401** (service is up, secret check working). If you get **503**, a `TATA_WA_*` var is missing. **404** means the deploy is on an older build that still had the Meta-era route.

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `TATA_WA_TOKEN` | ✅ | Omni access token — Settings → Channels → WhatsApp |
| `TATA_WA_WEBHOOK_SECRET` | ✅ | Random string we generate (`openssl rand -hex 24`); becomes the last path segment of the webhook URL |
| `TATA_WA_BASE_URL` | — | Defaults to `https://wb.omni.tatatelebusiness.com`; only set if Tata gives us a different host |
| `PUBLIC_URL` | ✅ | This service's own URL — BIA builds the "Create Shipment" deep link from it |
| `REDIS_URL` | ✅ | Dedupe + conversation memory. Without it replies get sent two or three times |
| `OPENAI_API_KEY` | ✅ | BIA runs on `gpt-4o-mini` |
| ITD credentials | ✅ | Same values as the main app — rates and tracking |

Webhook registration in the Omni panel happens after this and is handled with Bombino IT — not a deploy step. See `docs/whatsapp-webhook-registration.md`.

**Do NOT set** `DATABASE_URL`, any Supabase vars, or `SESSION_SECRET` on this service — the WhatsApp path is guest-only and never touches the customer database. Smaller blast radius on purpose.

## Not deploy work — flag if not done

The service will deploy and boot fine, but **cannot send WhatsApp replies** until Bombino IT has handed over the Omni access token (`TATA_WA_TOKEN`) and registered the webhook URL in the Omni panel. Deploy can proceed in parallel; just don't expect a working send until those land.
