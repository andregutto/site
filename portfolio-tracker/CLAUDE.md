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

## Key IDs

- Supabase project: `bkgpivxpzuzedezxtknd`
- André's user UUID: `453bc770-0cea-4c88-b72f-babf9e50437e`
- Frontend: `http://localhost:5174`
- Backend: `http://localhost:3001`
- Credentials: `frontend/.env` (not committed)
