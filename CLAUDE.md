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
- No routes implemented yet. See `server/routes.ts`.
- API spec placeholder: `docs/api-spec.md`
- All endpoints should be prefixed `/api`

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
