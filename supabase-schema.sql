-- ============================================================
--  MyLife App — Supabase Database Schema
--  Run this in: Supabase → SQL Editor → New query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
--  PROFILES — extends Supabase auth.users
-- ============================================================
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row-level security
alter table public.profiles enable row level security;
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ============================================================
--  FINANCE HUB — shared ledger across all finance modules
-- ============================================================
create table if not exists public.finance_ledger (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  source      text not null check (source in ('expense', 'budget', 'portfolio')),
  type        text not null check (type in ('income', 'expense', 'asset', 'liability')),
  amount      numeric(12, 2) not null,
  currency    text default 'AED',
  category    text,
  description text,
  date        date not null,
  metadata    jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.finance_ledger enable row level security;
create policy "Users can manage own ledger"
  on public.finance_ledger for all using (auth.uid() = user_id);

create index on public.finance_ledger (user_id, date desc);
create index on public.finance_ledger (user_id, source);

-- ============================================================
--  PHASE 2 — EXPENSES
-- ============================================================
create table if not exists public.expenses (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  amount      numeric(10, 2) not null,
  currency    text default 'AED',
  category    text not null,
  merchant    text,
  note        text,
  date        date not null,
  ledger_id   uuid references public.finance_ledger(id) on delete set null,
  created_at  timestamptz default now()
);

alter table public.expenses enable row level security;
create policy "Users can manage own expenses"
  on public.expenses for all using (auth.uid() = user_id);

create index on public.expenses (user_id, date desc);

-- ============================================================
--  PHASE 3 — BUDGET
-- ============================================================
create table if not exists public.budgets (
  id             uuid default uuid_generate_v4() primary key,
  user_id        uuid references public.profiles(id) on delete cascade not null,
  month          text not null, -- format: '2025-01'
  monthly_income numeric(12, 2) default 0,
  currency       text default 'AED',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, month)
);

create table if not exists public.budget_categories (
  id          uuid default uuid_generate_v4() primary key,
  budget_id   uuid references public.budgets(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null,
  limit_amount numeric(10, 2) not null,
  color       text default '#F5A623'
);

alter table public.budgets enable row level security;
alter table public.budget_categories enable row level security;
create policy "Users can manage own budgets"
  on public.budgets for all using (auth.uid() = user_id);
create policy "Users can manage own budget categories"
  on public.budget_categories for all using (auth.uid() = user_id);

-- ============================================================
--  PHASE 4 — PORTFOLIO
-- ============================================================
create table if not exists public.portfolio_holdings (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  asset_type  text not null check (asset_type in ('stock', 'gold', 'silver', 'crypto', 'other')),
  symbol      text not null,      -- e.g. 'AAPL', 'XAU', 'XAG'
  name        text not null,      -- e.g. 'Apple Inc.'
  quantity    numeric(18, 6) not null,
  buy_price   numeric(12, 4) not null,
  buy_date    date not null,
  currency    text default 'USD',
  notes       text,
  created_at  timestamptz default now()
);

alter table public.portfolio_holdings enable row level security;
create policy "Users can manage own holdings"
  on public.portfolio_holdings for all using (auth.uid() = user_id);

create index on public.portfolio_holdings (user_id, asset_type);

-- ============================================================
--  PHASE 5a — PERFUMES
-- ============================================================
create table if not exists public.perfumes (
  id               uuid default uuid_generate_v4() primary key,
  user_id          uuid references public.profiles(id) on delete cascade not null,
  brand            text not null,
  model            text not null,
  clone_similar    text,
  usage_type       text,                   -- e.g. 'Daily', 'Special'
  longevity        text,                   -- e.g. 'Long', 'Medium', 'Short'
  sillage          text,                   -- e.g. 'Heavy', 'Moderate', 'Soft'
  gender           text,
  value_rating     text,
  notes            text,
  season           text,
  purchase_link    text,
  purchased_price  numeric(10, 2),
  currency         text default 'AED',
  recommendable    boolean default false,
  got_compliment   boolean default false,
  rating           numeric(3, 1),          -- 0.0 – 10.0
  purchase_priority text,
  in_wishlist      boolean default false,
  created_at       timestamptz default now()
);

alter table public.perfumes enable row level security;
create policy "Users can manage own perfumes"
  on public.perfumes for all using (auth.uid() = user_id);

create index on public.perfumes (user_id, brand);

-- ============================================================
--  PHASE 5b — PRODUCT EXPIRY
-- ============================================================
create table if not exists public.expiry_items (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  name         text not null,
  category     text not null,   -- e.g. 'Food', 'Medicine', 'Cosmetics'
  expiry_date  date not null,
  quantity     text,
  notes        text,
  notified     boolean default false,
  created_at   timestamptz default now()
);

alter table public.expiry_items enable row level security;
create policy "Users can manage own expiry items"
  on public.expiry_items for all using (auth.uid() = user_id);

create index on public.expiry_items (user_id, expiry_date asc);
