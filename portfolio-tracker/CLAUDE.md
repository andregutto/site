# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend** (`frontend/`):
```bash
npm run dev      # Vite dev server → http://localhost:5174
npm run build    # tsc -b && vite build
npm run lint     # eslint
```

**Backend** (`backend/`):
```bash
npm run dev      # tsx watch src/index.ts → http://localhost:3001
npm run build    # tsc
```

No test suite exists yet. TypeScript validation: `npx tsc --noEmit` in either directory.

## Architecture

Three-tier stack: Vite/React frontend → Express backend → Supabase (PostgreSQL).

**Frontend** (`frontend/src/`):
- `contexts/AuthContext.tsx` — Supabase Auth session, `useAuth()` hook
- `lib/api.ts` — `apiFetch<T>(path, init?)` injects JWT automatically; all backend calls go through this
- `lib/fxService.ts` — FX rate helpers (calls `/api/fx/*`); not used for auth'd routes
- `lib/types.ts` — shared TypeScript interfaces for API responses
- `hooks/usePortfolio.ts` — data-fetching hooks (`usePortfolioValue`, `usePerformanceSummary`, `usePerformanceMonthly`, `useSyncHistory`)
- `pages/` — route-level components; `App.tsx` has `ProtectedRoutes` wrapping `AppLayout`
- Vite proxy: all `/api/*` requests are forwarded to `http://localhost:3001` (configured in `vite.config.ts`)

**Backend** (`backend/src/`):
- All routes require `requireAuth` middleware except `/api/fx/*` and `/health`
- `requireAuth` validates Supabase JWT via `supabaseAdmin.auth.getUser(token)`, injects `req.userId`
- `lib/cache.ts` — in-memory TTL cache (`cache.getOrFetch(key, ttlMs, fetcher)`). Shared across services. Key point: `portfolio.ts` and `fx.ts` share the same URL-based cache key for FX rates
- `lib/supabase.ts` — exports `supabaseAdmin` (service_role, bypasses RLS) used by all routes

**Supabase** (project `bkgpivxpzuzedezxtknd`):
- Schema in `supabase/migrations/001_initial_schema.sql`
- Seeds for André's portfolio in `supabase/seeds/example_andre/`
- All user tables have RLS; `supabaseAdmin` (service_role) bypasses it
- `fx_rates` has RLS enabled but no per-user policy — service_role can write freely

## Asset types and pricing

Three `asset_type` values determine how value is calculated:

| Type | Source | Key fields |
|---|---|---|
| `ticker` (Brasil) | brapi.dev | `ticker_brapi` |
| `ticker` (USA/ETF) | yahoo-finance2 v3 (`new YahooFinance()`) | `ticker_yahoo` |
| `ticker` (Cripto) | CoinGecko | `coingecko_id` |
| `fixed_income` | BCB séries 12/433/1178 | `fi_principal`, `fi_start_date`, `fi_type`, `fi_rate`, `fi_spread` |
| `manual` | `manual_values` table | user inputs monthly |

`priceService.ts` routes by type; for tickers tries brapi → coingecko → yahoo in order.

## FX rate pattern

`getFxRate(from, to='BRL')` in `portfolio.ts` uses a three-level fallback:
1. AwesomeAPI via shared URL cache key (same key as `fx.ts` route, TTL 5 min)
2. Most recent row in `fx_rates` Supabase table (saved on every successful API fetch)
3. Hardcoded approximations: `{ USD: 5.70, EUR: 6.40, GBP: 7.20 }`

The function **never throws** — always returns a number. This is critical: USD/EUR assets silently drop from the portfolio if FX conversion fails.

## Performance / price_history

The performance route reads from `price_history` (populated via `POST /api/portfolio/sync-history`). Until synced, all historical totals are 0. Fixed-income assets are not included in sync (their value is recalculated live from BCB).

## Route duplication trap (shared-api/ vs backend/ vs frontend/api/)

There are **three** places route files can live, and not all routes are shared between them:
- `shared-api/src/routes/*.ts` — the source of truth for most routes (`voyage.ts`, `finances.ts`, `people.ts`, `shared.ts`, `performance.ts`, `portfolio.ts`, etc). Both `backend/` and `frontend/api/` import from here.
- `backend/src/routes/*.ts` — local Express server (`npm run dev`, port 3001). Some files here are thin re-exports of `shared-api/`, but **some are full independent copies** (e.g. `performance.ts`, `portfolio.ts`, `notifications.ts` historically diverged from `shared-api/`).
- `frontend/api/_routes/*.ts` — Vercel serverless functions (production deploy, via `frontend/api/[...path].ts`). Mirrors `backend/src/routes/` for the same handful of files.

**Before editing route logic, check `backend/src/index.ts` and `frontend/api/_app.ts` to see which file each one actually imports.** When a file exists in more than one of these three locations, the same fix must be applied to all copies, or the change silently won't apply to whichever server is actually running (this has caused real bugs: a stock-split fix and a notification feature both landed in the wrong/incomplete copy before being caught). After editing, run `npx tsc --noEmit` in `backend/`, `shared-api/`, AND `frontend/api/` (via `npx tsc --noEmit -p tsconfig.json`), not just one.

Also run the **full** `npm run build` (not just `tsc --noEmit`) in `frontend/` before considering a frontend change done — `tsc -b` (used by `npm run build`, and by Vercel's build) catches errors `tsc --noEmit` misses (e.g. local component name collisions, stricter union-type checks).

## Shared-feature checklist (Voyage trips, Finance Moments, Shared Categories)

Any new "shared between users" feature (mirroring Voyage trip collaboration, Finance Moment collaboration, or Shared Categories) must include all of the following — this was unified on 2026-06-30 after finding inconsistent behavior across the three existing ones:

1. **Invite by @username or e-mail**, with live @ search (debounce, `GET /people/search?q=`) — not e-mail only.
2. **"Already-connected friends" shortcut** in the invite UI: fetch `/api/people`, filter `contexts.some(c => c.type === 'friend' && c.friend_status === 'active')`, render as one-click avatar+name chips.
3. **Explicit accept is always required** — never auto-activate a found user just because they have an account, even if they're a friend. The one exception: the invitee can opt in to **"auto-accept invites from this person"** per-friend (`user_friends.auto_accept_invites`, checked via `canAutoAccept()` in `shared-api/src/routes/people.ts`).
4. **Notification on invite**, with the accept action available **inline in the notification** (not just a link-through). Add a `getPendingXInvites`/`getRecentXAdditions` pair (mirror `voyage.ts`), wire into `notifications.ts` in **both** `backend/src/routes/` and `frontend/api/_routes/`, and add the type to `ACCEPT_ENDPOINT` in `frontend/src/contexts/NotificationsContext.tsx` + `ACCEPTABLE_TYPES` in `frontend/src/pages/NotificationsPage.tsx`.
5. **Public accept page** at `/<feature>/invite/:token` (mirror `AcceptTripInvitePage.tsx`): unauthenticated `GET` preview, authenticated `POST .../accept`, and the "not logged in → save token in `sessionStorage` → redirect to `/login` → auto-accept after login" flow.
6. **"Pessoas" page shortcut** ("+ Compartilhar X") plus a dedicated section in `ContactCard` showing the relationship and a revoke action.
7. Apply across all copies per the route-duplication trap above.
8. **Removing a friend connection must cascade-revoke all sharing** between the two users (all trips/moments/categories where either invited the other) — see `revokeAllSharingBetween()` in `shared-api/src/routes/people.ts`.

## Key IDs

- Supabase project: `bkgpivxpzuzedezxtknd`
- André's user UUID: `453bc770-0cea-4c88-b72f-babf9e50437e`
- Frontend: `http://localhost:5174`
- Backend: `http://localhost:3001`
- Credentials: `frontend/.env` (not committed)
