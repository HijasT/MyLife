<div align="center">

# 🏠 MyLife

**A private personal dashboard for managing your finances, health, calendar, and lifestyle.**

Built for yourself. Hosted free. Data stays yours.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)

[**Live Demo →**](https://mylife-in.vercel.app)

</div>

---

## What is MyLife?

MyLife is a **self-hosted personal dashboard** — not a SaaS, not a subscription product. You fork it, connect it to your own free Supabase and Vercel accounts, and own every byte of your data.

It currently covers 6 modules:

| Module | What it tracks |
|---|---|
| 🏠 **Dashboard** | Greeting · Dubai time & weather · Today's agenda |
| 💳 **Due Tracker** | Monthly bills · Groups (UAE / India) · Remittance · AED/INR/USD |
| 📈 **Portfolio** | Gold & silver (live via goldapi.io) · Stocks · P&L |
| 🌸 **Aromatica** | Fragrance collection · Bottle tracking · Wear logs |
| 🗓️ **Calendar** | Work shifts · Anniversaries · Events · Filter & search |
| 🧬 **BioMarkers** | Lab results · Body metrics · Trend charts |

---

## Stack

| Layer | Technology | Cost |
|---|---|---|
| Framework | Next.js 14 (App Router) | Free |
| Database | Supabase PostgreSQL | Free tier |
| Auth | Supabase Auth (email) | Free |
| Hosting | Vercel | Free tier |
| Metals prices | goldapi.io | Free (100 req/mo) |
| Weather | open-meteo.com | Free / no key |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Git](https://git-scm.com)
- A [Supabase](https://supabase.com) account (free)
- A [Vercel](https://vercel.com) account (free)

---

### 1 — Clone & Install

```bash
git clone https://github.com/HijasT/MyLife.git
cd MyLife
npm install
```

---

### 2 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Pick any region (Frankfurt is close to Dubai)
3. After it provisions, go to **SQL Editor** → **New query**
4. Copy the contents of `supabase-schema.sql` and run it
5. Note your **Project URL** and **anon public key** from **Settings → API**

---

### 3 — Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> ⚠️ **Never commit `.env.local`**. It is in `.gitignore`. Keep it local only.

---

### 4 — Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → sign up → verify email → you're in.

---

### 5 — Deploy to Vercel

**Option A — Vercel dashboard (recommended)**
1. Push your fork to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import repository
3. Add the two environment variables from `.env.local`
4. Deploy

**Option B — CLI**
```bash
npm install -g vercel
vercel
```

After deploying, update Supabase:
- **Authentication → URL Configuration → Site URL** → your Vercel URL
- **Authentication → Redirect URLs** → add `https://your-app.vercel.app/**`

---

### 6 — Add goldapi.io key (for gold & silver prices)

1. Sign up free at [goldapi.io](https://goldapi.io)
2. Copy your API key from the dashboard
3. In the app → **Portfolio → 📊 Live Prices** → click **Add API key**
4. Paste and save — key is stored in your Supabase profile, works on all devices

---

## Project Structure

```
src/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx              # Sidebar + auth guard
│   │   ├── page.tsx                # Dashboard home (server component)
│   │   ├── budget/                 # Due Tracker
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx       # Item detail
│   │   │   └── remittance/page.tsx # Remittance history
│   │   ├── portfolio/              # Portfolio
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── perfumes/               # Aromatica
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── biomarkers/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── settings/page.tsx
│   ├── login/page.tsx
│   └── auth/reset/page.tsx
├── components/
│   ├── Sidebar.tsx                 # Collapsible nav + export modal
│   └── ThemeProvider.tsx
├── hooks/
│   └── useSyncStatus.ts            # Online/offline + cache helpers
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   └── server.ts               # Server Supabase client
│   ├── modules.ts                  # Module registry
│   └── timezone.ts                 # Dubai timezone utilities
└── types/index.ts
```

---

## Security Notes

- All database tables have **Row Level Security (RLS)** enabled
- Every policy checks `auth.uid() = user_id` — users can only ever read/write their own data
- The Supabase anon key is safe to expose publicly — RLS is the security layer
- The goldapi.io key is stored in your **private Supabase profile row**, not in the client bundle
- **Never commit `.env.local`** — add it to `.gitignore` before making the repo public

---

## Windows Setup

See [WINDOWS-SETUP.md](./WINDOWS-SETUP.md) for Windows-specific instructions.

---

## Roadmap

- [ ] Expense Tracker module
- [ ] Expiry Tracker module
- [ ] Push notifications for upcoming dues & anniversaries
- [ ] Annual budget view
- [ ] Portfolio P&L chart over time

---

## License

MIT — use it however you like.
