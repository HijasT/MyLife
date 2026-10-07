# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MyLife is a self-hosted personal dashboard (Next.js + Supabase) for finances, health, and lifestyle tracking. It's built for a single owner (not a multi-tenant SaaS), deployed on Vercel, with all data owned in the user's own Supabase project. Every module is scoped to `auth.uid()` via Postgres Row Level Security — there is no other authorization layer.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start dev server at http://localhost:3000
npm run build     # production build
npm run start     # run the production build
npm run lint      # eslint . (flat config at eslint.config.mjs — `next lint` was removed in Next.js 16)
```

No test suite is configured. Verify changes with `npm run dev` + manual testing, or `npm run build` to catch type errors (`strict: true` in tsconfig).

## Environment

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from a Supabase project's Settings → API. The anon key is safe to expose client-side; RLS is the actual security boundary.
- `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`

Database schema lives in `supabase-schema.sql` — run it in the Supabase SQL Editor to provision tables. It's a full reconstruction from the live project's actual schema (introspected directly, not hand-maintained — there are no versioned migrations), so treat it as more trustworthy than assuming it matches code at a glance. It documents two things worth knowing before touching either module:
- `calendar_events` has real, indexed columns (`series_id`, `shift_name`, `is_deleted`, `recurrence_interval`, `recurrence_until`) that the Calendar client never reads or writes — it still encodes the same data as text inside `notes` and hard-deletes rows. Looks like an unfinished migration; don't assume those columns are wired up.
- `finance_ledger`/`portfolio_holdings`/`expiry_items` exist live with RLS enabled but have zero rows and no client code anywhere reading/writing them — likely earlier schema attempts or unbuilt features (`expiry_items` matches the reserved-but-unused `"expiry"` `ModuleId`; `finance_ledger`'s `source` check constraint spans `expense`/`budget`/`portfolio` as a planned shared cross-module ledger). Don't assume a table with rows in the schema file means a shipped feature. The Expenses module itself (`expenses`/`budgets`/`budget_categories` tables, the `"expenses"` `ModuleId`, and its `coming-soon` stub page) was removed entirely — it was never built.

## Architecture

### Auth & routing

Two separate places enforce the same auth boundary:
- `src/proxy.ts` — Next.js 16 renamed `middleware.ts` to `proxy.ts` (matcher: `/dashboard/:path*`, `/login`). Redirects unauthenticated users away from `/dashboard/*` and authenticated users away from `/login`.
- `src/app/dashboard/layout.tsx` — a server component that re-checks `supabase.auth.getUser()` and redirects to `/login` if absent, then loads `profiles.hidden_modules` to filter the sidebar.

`src/app/auth/callback/route.ts` exchanges the Supabase OAuth/magic-link code for a session and redirects to `/dashboard`.

There are two Supabase client factories — use the right one:
- `src/lib/supabase/client.ts` — browser client (`createBrowserClient`), used in `"use client"` module pages for all data fetching/mutation.
- `src/lib/supabase/server.ts` — server client (`createServerClient`, cookie-based), used only in server components/route handlers (layout auth check, auth callback).

### Module system

`src/lib/modules.ts` (`MODULES` array) is the single registry of dashboard modules — id, label, icon, route, `group` (`finance` | `lifestyle`), `status` (`active` | `coming-soon`), and accent color. `src/types/index.ts` (`ModuleId`) must be kept in sync when adding a module. The sidebar (`src/components/Sidebar.tsx`) renders from this registry and respects each user's `hidden_modules` (stored per-profile in Supabase, editable from Settings).

Each module is a route under `src/app/dashboard/<module>/` and is almost always a `"use client"` page that fetches its own data directly from Supabase via `createClient()` from `lib/supabase/client` — there is no shared data-fetching/store layer between modules. Detail views live at `src/app/dashboard/<module>/[id]/page.tsx`.

### Offline/sync affordances

Online/offline is tracked inline by the sidebar's `SyncBadge` (`src/components/Sidebar.tsx`) via the browser `online`/`offline` events. There is no shared offline cache layer — a former `useSyncStatus` hook (`isOnline`, `saveToCache`/`loadFromCache`, `markSynced`) was removed as dead code; only the service worker (`public/sw.js`) provides any caching.

### Styling & theming

Tailwind v4 (CSS-first config via `@theme` in `src/app/globals.css` — there is no `tailwind.config.js`). Dark mode is class-based: `ThemeProvider` (`src/components/ThemeProvider.tsx`) toggles a `dark` class on `<html>` and persists the choice to `localStorage` (`theme` key).

The color system in active use is the set of CSS custom properties defined in `globals.css` (`--main-bg`, `--card-bg`, `--text-primary`, etc. in `:root`, overridden in `.dark`) — style components against those. `src/lib/mylife-design-tokens.ts` only exports the spacing (`mylifeSpacing`) and radius (`mylifeBorderRadius`) scales, used by `dashboard/page.tsx`'s module cards; it intentionally has no color exports, so there's one color system to keep in sync, not two.

### Timezone

Per-user, not fixed: `profiles.timezone` is a real IANA timezone string (default `'Asia/Dubai'`, editable in Settings). `src/lib/timezone.ts` exports `APP_TZ` ('Asia/Dubai', the default only) plus `todayDubai()`/`nowDubai()`/`fmtDubai()`/`fmtDateDubai()`, each taking an optional `tz` param that defaults to `APP_TZ` — call `getUserTimezone(supabase, userId)` once per page load to get the signed-in user's real preference (validated, falls back to `APP_TZ`) and pass it through instead of relying on the default. Use these instead of raw `Date`/`toLocaleDateString`/hardcoded `timeZone: "Asia/Dubai"` when displaying or computing "today" for due dates, calendar entries, expiry dates, etc.

### Portfolio currency conversion

`src/lib/portfolio.ts` is the shared source of truth for `FX_TO_AED`, gold purity factors, and `calcCurrentValue()` (gold-by-weight uses `weightGrams × currentPrice × purityFactor`, everything else is `currentPrice × totalUnits`) — both `portfolio/page.tsx` and `portfolio/[id]/page.tsx` import from it rather than each keeping their own copy. Note this FX table is a separate, hardcoded set of rates from what Due Tracker uses (`due_month_settings.fx_rates`, per-month and user-editable) and the two currently disagree — there's no shared currency-conversion source of truth across the whole app, just within Portfolio. Reconciling that is a real product decision (should Portfolio read `fx_rates` too? should FX become a per-profile setting?), not something to silently pick a side on.

### Security headers

`next.config.mjs` sets standard security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.) globally via `headers()`, and restricts remote images to `*.supabase.co` storage paths.
