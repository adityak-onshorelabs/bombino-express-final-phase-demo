# Bombino Express — CLAUDE.md

## Project Overview
India-to-USA shipping logistics platform (Phase 1). Features: shipment tracking, rate calculator, booking flow, user auth, and push notifications.
Phase 1 (MVP) — frontend integrated with available backend API with reference to api-spec.md.

## Tech Stack
| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript 5.6, Vite 7, TailwindCSS 4 |
| UI | shadcn/ui (New York style), Radix UI, Lucide React, Framer Motion |
| Routing | Wouter 3.3 |
| State | Zustand 5 (localStorage persistence) + TanStack React Query 5 |
| Forms | React Hook Form + Zod validation |
| Backend | Express 4.21, Node 20 |
| Database | PostgreSQL via Drizzle ORM 0.39 |
| Auth | Passport.js + express-session (scaffolded, not wired) |
| Build | Vite (client), esbuild (server), tsx (dev runner) |

## Project Structure
```
/client/src/
  pages/          # 14 route-level components (Splash, Home, Rates, CreateShipment, etc.)
  components/     # Custom: Header, BottomNav, ShipmentCard, StatusBadge, TrackingTimeline, SideMenu
  components/ui/  # 57+ shadcn/ui primitives
  lib/            # mockData.ts, store.ts (Zustand), queryClient.ts, utils.ts
  hooks/          # use-mobile.tsx, use-toast.ts
/server/
  index.ts        # Express entry point, port 5000
  routes.ts       # API route registration stub (all routes prefixed /api)
  storage.ts      # IStorage interface + MemStorage (in-memory, DB not wired)
  vite.ts         # Vite dev middleware
/shared/
  schema.ts       # Drizzle schema (users table) + Zod insert schemas
/docs/
  api-spec.md     # Empty placeholder
  Bombino Express Proposal.pdf
/attached_assets/ # Brand images and proposal text
```

## Setup & Installation
```bash
npm install
# Requires DATABASE_URL env var for PostgreSQL:
export DATABASE_URL="postgresql://user:pass@host/db"
npm run db:push   # Push schema to database
npm run dev       # Start server (port 5000, serves client via Vite middleware)
```

## Development Commands
```bash
npm run dev        # Express + Vite dev server on :5000
npm run dev:client # Vite only on :5000 (client-only)
npm run build      # Production build (client → dist/public, server → dist/index.cjs)
npm run start      # Run production build
npm run check      # TypeScript type check (tsc --noEmit)
npm run db:push    # Sync Drizzle schema to database
```
No test framework configured yet.

## Architecture & Patterns

**Monorepo layout**: `/client` (React), `/server` (Express), `/shared` (Drizzle schema + types shared across both).

**State**: Zustand store (`lib/store.ts`) persists `hasSeenOnboarding`, `isLoggedIn`, `user` to `localStorage` as `bombino-storage`. Shipments and notifications are in-memory (reset on refresh).

**Data layer**: All data currently comes from `lib/mockData.ts` (8,200+ lines). Server `storage.ts` defines `IStorage` interface — swap `MemStorage` for a DB-backed class when implementing routes.

**API pattern**: All server routes go in `server/routes.ts`, prefixed `/api`. Client uses React Query + custom fetch wrapper from `queryClient.ts` which handles 401s and includes credentials.

**Build**: Server bundles to CommonJS (`dist/index.cjs`). Client builds to `dist/public`. In dev, Express serves the Vite middleware directly.

## API Reference
- Routes live in `server/routes.ts`. API spec: `docs/api-spec.md`
- All endpoints are prefixed `/api`

## BIA (AI support assistant)
BIA runs on OpenAI (`gpt-4o-mini`) with 5 tools — rates, tracking, guidance, escalation, shipment history.
- Agent: `server/supportAgent.ts` (`handleChat(messages, context)`), content in `server/supportContent.ts`
- **Tracking scope**: ITD requires `customer_code` and scopes results to it. `ITD_CUSTOMER_CODE` answers "AWB number not found" for *every* docket, including ones this app booked — the account that sees all of them is `"superadmin"`. BIA's `get_tracking_summary` sends that plus the company token (never the caller's session token), so anyone can track any AWB; `GET /api/shipments/track/:trackingNo` sends `user.code` when logged in and `"superadmin"` for guests
- **In-app channel**: `POST /api/support/chat` — session-authed, history in Supabase `support_sessions`
- **WhatsApp channel** (Tata Tele Omni BSP, base `https://wb.omni.tatatelebusiness.com`): `POST /api/whatsapp/webhook/:secret`
  - `server/whatsapp.ts` — transport: webhook secret check, inbound parse, sends
  - `server/whatsappBia.ts` — inbound → `handleChat` → reply
  - `server/whatsappSession.ts` — Redis history (30 min TTL), webhook dedupe, per-number rate limit
  - `server/whatsappFormat.ts` — strips `TAP_*` tokens into buttons/CTAs (mirrors `client/src/lib/supportMessage.ts`)
  - Phase 1 is **guest-only**: no phone→account mapping, so `get_user_shipments` is unavailable there
  - Env: `TATA_WA_TOKEN`, `TATA_WA_WEBHOOK_SECRET` (both required, else the webhook 503s); `TATA_WA_BASE_URL` optional
  - CTA links come from `APP_URL` (defaults `https://app.bombinoexp.com`), **not** `PUBLIC_URL` — that one is this server's own host and only builds KYC `file_path` URLs for ITD
  - Tata does **not** sign webhooks — the unguessable `:secret` path segment is the only proof of origin
  - Send payloads are Meta Cloud API shaped minus `messaging_product`, plus `source`; `to` needs a leading `+`
  - Inbound is flattened: `{ contacts, messages: {...} }`, *not* Meta's `entry[].changes[].value.messages[]`
  - Free-form replies use Omni's Session API (24h window); templates only needed for outbound
  - Docs: help.omni.tatatelebusiness.com `/pages/session-api`, `/pages/api-docs`
  - Dev: `ngrok http 5000`, then set the webhook URL in Omni panel → Integration

### Usage tracking (`server/biaUsage.ts`)
Every `handleChat` turn records tokens, OpenAI round-trips, tool names, latency, and success — **per channel, in separate Redis namespaces**, because the two are not comparable (app = one HTTP request with client-supplied history; WhatsApp = webhook-driven, guest-only, billed by Tata per 24h conversation).
- `SupportChatContext.channel` (`"app" | "whatsapp"`) + `actorKey` drive attribution — required fields, so a new call site can't silently mis-attribute
- Keys: `bia:usage:<channel>:<IST date>` (hash), `:tools` (histogram), `:actors` (set → uniques). **400-day TTL** — counters back client invoices, so a dispute over March needs March
- `actorKey` is always hashed (truncated SHA-256): `wa_…` from the number on WhatsApp, `app_u_…` from `dbUserId` or `app_ip_…` from the IP for app guests. **Not `req.sessionID`** — `saveUninitialized: false` means an un-modified session gets a fresh id every request, so every guest message would look like a new person. Hashed IP mirrors what `supportRateLimit` already keys guests on: coarse (one office = one bucket) but stable, and coarse errs toward under-counting
- WhatsApp-only counters (no app equivalent): `parts_sent` (what Tata actually transmits — one reply can split), `rate_limited`, `duplicate`
- **Conversations** (`startConversation`, key `bia:conv:<channel>:<actorKey>`) are the billing unit: WhatsApp = fixed 24h window from the first message, never extended (matches Tata's own unit); app = 30-min sliding idle gap. `SET NX` so concurrent messages can't double-count, and it fails *closed* when Redis is down — under-billing beats a disputed invoice. Counted before the WhatsApp throttle check, since a throttled user still gets a reply
- Three views, all gated by `BIA_USAGE_SECRET` (unset ⇒ 503), all `no-store` + noindex with relative links so the secret never enters the markup:
  | URL | For | Built by |
  |---|---|---|
  | `…/usage/:secret` | JSON | `biaUsage.getUsageReport` |
  | `…/usage/:secret/view` | technical dashboard | `server/usageDashboard.ts` |
  | `…/usage/:secret/billing?month=YYYY-MM` | plain-English monthly invoice summary | `server/billingPage.ts` |
- Billing page is deliberately jargon-free (no tokens/latency/tool names), print-friendly, and shows amounts only when `BILL_RATE_WHATSAPP_CONVERSATION` / `BILL_RATE_APP_CONVERSATION` are set — it never guesses a price. `BILL_CURRENCY_SYMBOL` defaults `₹`
- Both pages are self-contained server-rendered files: inline CSS/SVG, no deps, no build step. Series colour tracks the channel (app blue / WhatsApp orange, CVD-validated in light **and** dark)
- Redis down ⇒ counters no-op, but the `[biaUsage] {json}` log line is always emitted first, so Railway logs stay a complete record
- `withRedis` lives in `server/redisSafe.ts` — shared with `whatsappSession.ts`

## Coding Conventions
- **TypeScript strict mode** — no `any`, explicit return types on exports
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`
- **Components**: PascalCase files, named exports, co-located with their page
- **Styling**: Tailwind utility classes; `cn()` from `lib/utils.ts` for conditional classes
- **Primary color**: `#C62828` (crimson red); font: Plus Jakarta Sans
- **shadcn/ui**: New York style; add components via `npx shadcn@latest add <component>`
- **Forms**: React Hook Form + Zod schemas derived from Drizzle tables via `drizzle-zod`
- **Mobile-first**: All pages designed for mobile; `useIsMobile()` hook at 768px breakpoint

## Key Files
| File | Purpose |
|---|---|
| `client/src/App.tsx` | Route definitions (14 routes) |
| `client/src/lib/mockData.ts` | All mock data + interfaces (Shipment, TrackingEvent, etc.) |
| `client/src/lib/store.ts` | Zustand global state |
| `server/index.ts` | Express server setup |
| `server/routes.ts` | **Where to add API routes** |
| `server/storage.ts` | Storage interface — implement DB here |
| `shared/schema.ts` | Drizzle schema + Zod types |
| `vite.config.ts` | Vite + path aliases config |
| `components.json` | shadcn/ui configuration |

## Project Docs
- Business proposal: `docs/Bombino Express Proposal.pdf`
- API spec : `docs/api-spec.md`
