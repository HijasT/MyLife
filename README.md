<<<<<<< HEAD
# MyLife — Personal Dashboard

Your personal life management hub. Finance, lifestyle, everything in one place.

## Stack

| Layer | Tech | Cost |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS | Free |
| Auth | Supabase Auth (Google OAuth) | Free |
| Database | Supabase PostgreSQL | Free |
| Hosting | Vercel | Free |
| Domain | Optional | ~$1/mo |

---

## Phase 1 Setup — Step by Step

### 1. Clone and install

```bash
git clone <your-repo>
cd mylife-app
npm install
```

---

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name it `mylife-app`, pick a region close to Dubai (e.g. AWS Frankfurt)
3. Wait ~2 minutes for it to provision

---

### 3. Run the database schema

1. In Supabase → **SQL Editor** → **New query**
2. Copy the entire contents of `supabase-schema.sql`
3. Paste and click **Run**

This creates all tables for all 5 phases, with row-level security enabled.

---

### 4. Enable Google OAuth in Supabase

1. Supabase → **Authentication** → **Providers** → **Google** → Enable
2. You'll need a Google OAuth Client ID and Secret:
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Create a project → **APIs & Services** → **Credentials** → **Create OAuth Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://your-project.supabase.co/auth/v1/callback`
3. Paste the Client ID and Secret into Supabase
4. Save

---

### 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Find these in: Supabase → **Settings** → **API**

---

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to login.

---

### 7. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) → **New Project**.

Add the same environment variables in Vercel → **Settings** → **Environment Variables**.

Then update Supabase:
- **Authentication** → **URL Configuration** → **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`

---

## Project Structure

```
src/
├── app/
│   ├── auth/callback/      # OAuth callback handler
│   ├── dashboard/
│   │   ├── layout.tsx      # Sidebar + auth guard
│   │   ├── page.tsx        # Overview / home
│   │   ├── expenses/       # Phase 2
│   │   ├── budget/         # Phase 3
│   │   ├── portfolio/      # Phase 4
│   │   ├── perfumes/       # Phase 5
│   │   └── expiry/         # Phase 5
│   ├── login/              # Google login page
│   └── layout.tsx          # Root layout + fonts
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar
│   └── ComingSoon.tsx      # Module placeholder
├── lib/
│   ├── supabase/
│   │   ├── client.ts       # Browser client
│   │   └── server.ts       # Server client
│   └── modules.ts          # Module registry
├── middleware.ts            # Auth route protection
└── types/index.ts          # Shared TypeScript types
```

## Adding a New Module (Future Phases)

1. Add module definition to `src/lib/modules.ts`
2. Create `src/app/dashboard/your-module/page.tsx`
3. Add table to `supabase-schema.sql` and run in Supabase SQL Editor
4. Change `status: "coming-soon"` → `status: "active"` in modules.ts

That's it — auth, sidebar, and layout are inherited automatically.

---

## Finance Hub

The three finance modules (Expenses, Budget, Portfolio) share the `finance_ledger` table. This enables:

- **Net worth** = portfolio value + savings
- **Savings rate** = (income − expenses) / income
- **Spend vs budget** = expenses by category vs budget limits
- **Portfolio as % of net worth**

All calculated in real time as you add data to any module.
=======
# MyLife
>>>>>>> c2e6e9281fe9445940d81a14becd53f66e6131c8
