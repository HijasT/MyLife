-- ============================================================
-- MyLife App — Supabase Schema
-- Run in: Supabase → SQL Editor → New query
-- Last updated: 2026-07 — reconstructed directly from the live
-- project (sbympdelvyjdggtqqhlv) via introspection, not hand-maintained.
-- No versioned migrations exist for this project (schema changes have
-- historically been applied ad hoc via the SQL Editor), so this file
-- is the closest thing to a source of truth — but if you've made
-- manual changes since 2026-07, re-verify before trusting it blindly.
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES — extends auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email             text,
  full_name         text,
  display_name      text,
  avatar_url        text,
  hidden_modules    text[]   DEFAULT '{}',
  timezone          text     DEFAULT 'Asia/Dubai',
  goldapi_key       text,
  metal_prices      jsonb,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- DUE TRACKER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.due_items (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name              text NOT NULL,
  group_name        text DEFAULT 'General',
  due_date_day      int,            -- day of month (1-31)
  statement_date    int,            -- statement day of month
  default_currency  text DEFAULT 'AED',
  default_amount    numeric,
  is_fixed          boolean DEFAULT false,
  is_hidden         boolean DEFAULT false,
  sort_order        int DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.due_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own due items"
  ON public.due_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_items_user ON public.due_items(user_id);

CREATE TABLE IF NOT EXISTS public.due_entries (
  id                    uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id               uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  due_item_id           uuid REFERENCES public.due_items(id) ON DELETE CASCADE NOT NULL,
  month                 text NOT NULL,      -- YYYY-MM
  amount                numeric,
  currency              text DEFAULT 'AED',
  status                text DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','waived')),
  amount_paid           numeric DEFAULT 0 NOT NULL,
  paid_at               timestamptz,
  last_paid_at          timestamptz,
  carry_forward_amount  numeric DEFAULT 0,
  carried_forward_from  uuid REFERENCES public.due_entries(id),
  note                  text,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(due_item_id, month)
);

ALTER TABLE public.due_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own due entries"
  ON public.due_entries FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_entries_month ON public.due_entries(user_id, month);
CREATE INDEX IF NOT EXISTS due_entries_carried_forward_from_idx ON public.due_entries(carried_forward_from);

-- Individual payment records against a due_entries row (supports partial
-- payments — a single entry can accumulate several payments over time).
CREATE TABLE IF NOT EXISTS public.due_payments (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  due_entry_id  uuid REFERENCES public.due_entries(id) ON DELETE CASCADE NOT NULL,
  paid_amount   numeric NOT NULL CHECK (paid_amount > 0),
  note          text,
  paid_at       timestamptz DEFAULT now() NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own due payments"
  ON public.due_payments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_payments_due_entry_idx ON public.due_payments(due_entry_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS due_payments_user_id_paid_at_idx ON public.due_payments(user_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS public.due_month_settings (
  id               uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  month            text NOT NULL,   -- YYYY-MM
  main_currency    text DEFAULT 'AED',
  note             text,
  cash_in          jsonb DEFAULT '{}',
  fx_rates         jsonb DEFAULT '{}',
  groups           text[] DEFAULT '{UAE,India}',
  remittance_inr   numeric,
  remittance_rate  numeric,
  remittance_paid  boolean DEFAULT false,
  is_locked        boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.due_month_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own month settings"
  ON public.due_month_settings FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_month_settings_user_month_locked_idx ON public.due_month_settings(user_id, month, is_locked);

-- ============================================================
-- PORTFOLIO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id                       uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                  uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  symbol                   text NOT NULL,
  name                     text NOT NULL,
  asset_type               text DEFAULT 'other' CHECK (asset_type IN ('gold','silver','stock','crypto','other')),
  unit_label               text DEFAULT 'unit',
  main_currency            text DEFAULT 'AED',
  current_price            numeric,
  current_price_updated_at timestamptz,
  live_price_symbol        text,   -- e.g. XAU_OZ, PARKIN.DFM — drives auto price refresh
  gold_purity_karat        int,    -- 24/22/21/18 — for weight-based gold valuation
  weight_grams             numeric,
  notes                    text,
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own portfolio items"
  ON public.portfolio_items FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.portfolio_purchases (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_id           uuid REFERENCES public.portfolio_items(id) ON DELETE CASCADE NOT NULL,
  transaction_type  text DEFAULT 'buy' CHECK (transaction_type IN ('buy','sell')),
  purchased_at      timestamptz DEFAULT now() NOT NULL,
  unit_price        numeric NOT NULL,
  units             numeric NOT NULL,
  total_paid        numeric NOT NULL,
  currency          text DEFAULT 'AED',
  source            text,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own portfolio purchases"
  ON public.portfolio_purchases FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_purchases_user_item_date ON public.portfolio_purchases(user_id, item_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_alerts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id       uuid REFERENCES public.portfolio_items(id) ON DELETE CASCADE NOT NULL,
  alert_type    text NOT NULL CHECK (alert_type IN ('above','below')),
  target_price  numeric NOT NULL,
  is_active     boolean DEFAULT true,
  triggered_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own portfolio alerts"
  ON public.portfolio_alerts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_user_item ON public.portfolio_alerts(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_alerts_active ON public.portfolio_alerts(user_id, is_active);

-- ============================================================
-- CALENDAR
--
-- NOTE — unfinished migration: series_id, shift_name, is_deleted,
-- recurrence_interval, and recurrence_until are real, indexed columns
-- that the client (src/app/dashboard/calendar/page.tsx) never reads or
-- writes. It still encodes seriesId/shiftName as text inside `notes`,
-- and hard-deletes rows instead of using is_deleted. Kept here for
-- schema accuracy; migrating the client to use these columns is a
-- deliberately separate, reviewed piece of work, not folded in here.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                    uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id               uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date                  date NOT NULL,
  title                 text NOT NULL,
  event_type            text DEFAULT 'event'
                          CHECK (event_type IN ('work','birthday','event','due_paid','perfume_purchase','perfume_archived','note')),
  source_module         text DEFAULT 'manual',
  source_id             uuid,
  work_start            time,
  work_end              time,
  color                 text DEFAULT '#F5A623',
  notes                 text,
  is_recurring          boolean DEFAULT false,
  recur_type            text CHECK (recur_type IS NULL OR recur_type IN ('weekly','monthly','yearly')),
  -- Present but unused by the client (see note above):
  series_id             uuid,
  shift_name            text,
  recurrence_interval   int DEFAULT 1 CHECK (recurrence_interval >= 1),
  recurrence_until      date,
  is_deleted            boolean DEFAULT false,
  updated_at            timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own calendar events"
  ON public.calendar_events FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON public.calendar_events(user_id, date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_event_type ON public.calendar_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_series ON public.calendar_events(user_id, series_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_recurring ON public.calendar_events(user_id, is_recurring, recur_type);

-- ============================================================
-- AROMATICA (Perfumes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfumes (
  id                 uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id            uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  brand              text NOT NULL,
  model              text NOT NULL,
  status             text DEFAULT 'wardrobe',
  gender             text,
  usage_type         text,
  season             text,
  image_url          text,
  rating             numeric,
  rating_stars       numeric,
  notes_tags         text[] DEFAULT '{}',
  weather_tags       text[] DEFAULT '{}',
  gender_scale       int DEFAULT 2,
  longevity          text,
  sillage            text,
  value_rating       text,
  clone_similar      text,
  notes              text,
  notes_text         text,
  recommendable      boolean DEFAULT false,
  got_compliment     boolean DEFAULT false,
  in_wishlist        boolean DEFAULT false,
  purchase_priority  text,
  purchase_link      text,
  purchased_price    numeric,
  target_price_aed   numeric,
  preferred_shop     text,
  currency           text DEFAULT 'AED',
  archived_at        timestamptz,
  resale_price_aed   numeric,
  archive_notes      text,
  archive_reason     text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.perfumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own perfumes"
  ON public.perfumes FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS perfumes_user_id_brand_idx ON public.perfumes(user_id, brand);

CREATE TABLE IF NOT EXISTS public.perfume_bottles (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  perfume_id        uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  bottle_size_ml    numeric DEFAULT 100,
  bottle_type       text DEFAULT 'Full bottle',
  status            text DEFAULT 'In collection' CHECK (status IN ('Wardrobe','Archive')),
  usage             text DEFAULT 'Casual',
  archive_reason    text CHECK (archive_reason IS NULL OR archive_reason IN ('sold','emptied','gifted')),
  archive_comment   text,
  archived_at       timestamptz,
  resale_price_aed  numeric CHECK (resale_price_aed IS NULL OR resale_price_aed >= 0),
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_bottles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bottles"
  ON public.perfume_bottles FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS perfume_bottles_perfume_id ON public.perfume_bottles(perfume_id);
CREATE INDEX IF NOT EXISTS perfume_bottles_user_status_idx ON public.perfume_bottles(user_id, status);
CREATE INDEX IF NOT EXISTS perfume_bottles_perfume_status_idx ON public.perfume_bottles(perfume_id, status);
CREATE INDEX IF NOT EXISTS perfume_bottles_archive_reason_idx ON public.perfume_bottles(user_id, archive_reason);

CREATE TABLE IF NOT EXISTS public.perfume_purchases (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  perfume_id  uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  bottle_id   uuid REFERENCES public.perfume_bottles(id) ON DELETE SET NULL,
  date        date NOT NULL,
  ml          numeric DEFAULT 0,
  price       numeric DEFAULT 0,
  currency    text DEFAULT 'AED',
  shop_name   text DEFAULT 'Unknown',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own purchases"
  ON public.perfume_purchases FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS perfume_purchases_date ON public.perfume_purchases(user_id, date DESC);
CREATE INDEX IF NOT EXISTS perfume_purchases_perfume_id ON public.perfume_purchases(perfume_id);

CREATE TABLE IF NOT EXISTS public.perfume_wear_logs (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  perfume_id  uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  worn_on     date NOT NULL,
  compliment  boolean DEFAULT false,
  sprays      int DEFAULT 0,
  weather_tag text,
  occasion    text,
  performance text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_wear_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wear logs"
  ON public.perfume_wear_logs FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS perfume_wear_logs_user_perfume_date_idx ON public.perfume_wear_logs(user_id, perfume_id, worn_on DESC);
CREATE INDEX IF NOT EXISTS perfume_wear_logs_user_date_idx ON public.perfume_wear_logs(user_id, worn_on DESC);

-- ============================================================
-- BIOMARKERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.biomarker_tests (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  group_name  text NOT NULL,
  name        text NOT NULL,
  method      text,
  ref_range   text,
  ref_min     numeric,
  ref_max     numeric,
  unit        text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.biomarker_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own biomarker tests"
  ON public.biomarker_tests FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.biomarker_results (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  test_id     uuid REFERENCES public.biomarker_tests(id) ON DELETE CASCADE NOT NULL,
  test_date   date NOT NULL,
  value_num   numeric,
  value_text  text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(test_id, test_date)
);

ALTER TABLE public.biomarker_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own biomarker results"
  ON public.biomarker_results FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS bm_results_date ON public.biomarker_results(user_id, test_date DESC);

-- Tracks a single lab visit (date + total cost); biomarker_results rows
-- from the same draw share a test_date but aren't formally linked to a
-- session row anywhere in the client yet.
CREATE TABLE IF NOT EXISTS public.biomarker_lab_sessions (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  session_date    date NOT NULL,
  total_paid_aed  numeric CHECK (total_paid_aed IS NULL OR total_paid_aed >= 0),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, session_date)
);

ALTER TABLE public.biomarker_lab_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lab sessions"
  ON public.biomarker_lab_sessions FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS biomarker_lab_sessions_user_date_idx ON public.biomarker_lab_sessions(user_id, session_date DESC);

CREATE TABLE IF NOT EXISTS public.body_metrics (
  id                  uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  measured_at         date NOT NULL,
  weight_kg           numeric,
  height_cm           numeric,
  bmi                 numeric,
  body_fat_pct        numeric,
  visceral_fat_l      numeric,
  skeletal_muscle_kg  numeric,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(user_id, measured_at)
);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own body metrics"
  ON public.body_metrics FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INVENTORY (Home · Food · Wardrobe)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name            text NOT NULL,
  category        text DEFAULT 'Other',
  subcategory     text,
  location        text,
  quantity        numeric DEFAULT 1,
  unit            text DEFAULT 'pcs',
  expiry_date     date,
  brand           text,
  image_url       text,
  notes           text,
  is_finished     boolean DEFAULT false,
  low_threshold   numeric,
  purchase_date   date,
  purchase_price  numeric,
  currency        text DEFAULT 'AED',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own inventory"
  ON public.inventory_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS inventory_user_cat ON public.inventory_items(user_id, category);
CREATE INDEX IF NOT EXISTS inventory_expiry ON public.inventory_items(user_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- ============================================================
-- EXPENSES / BUDGET — tables exist live but Expenses is still
-- status:"coming-soon" in src/lib/modules.ts; no client code reads or
-- writes any of these four tables yet. Kept here for accuracy since
-- they're already provisioned, not because anything depends on them.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_ledger (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source      text NOT NULL CHECK (source IN ('expense','budget','portfolio')),
  type        text NOT NULL CHECK (type IN ('income','expense','asset','liability')),
  amount      numeric NOT NULL,
  currency    text DEFAULT 'AED',
  category    text,
  description text,
  date        date NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.finance_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own ledger"
  ON public.finance_ledger FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS finance_ledger_user_id_source_idx ON public.finance_ledger(user_id, source);
CREATE INDEX IF NOT EXISTS finance_ledger_user_id_date_idx ON public.finance_ledger(user_id, date DESC);

CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  ledger_id   uuid REFERENCES public.finance_ledger(id),
  amount      numeric NOT NULL,
  currency    text DEFAULT 'AED',
  category    text NOT NULL,
  merchant    text,
  note        text,
  date        date NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own expenses"
  ON public.expenses FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS expenses_user_id_date_idx ON public.expenses(user_id, date DESC);

CREATE TABLE IF NOT EXISTS public.budgets (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  month           text NOT NULL,
  monthly_income  numeric DEFAULT 0,
  currency        text DEFAULT 'AED',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own budgets"
  ON public.budgets FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.budget_categories (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  budget_id     uuid REFERENCES public.budgets(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  limit_amount  numeric NOT NULL,
  color         text DEFAULT '#F5A623'
);

ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own budget categories"
  ON public.budget_categories FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- UNUSED SCAFFOLDING — live, RLS-enabled, zero rows, and no client
-- code anywhere references them. Likely an earlier schema attempt
-- (portfolio_holdings predates portfolio_items/portfolio_purchases)
-- or planned-but-unbuilt features (expiry_items matches the "expiry"
-- ModuleId already reserved in src/types/index.ts and the unchecked
-- "Expiry Tracker module" item in README's roadmap). Kept for
-- accuracy; consider dropping if they're confirmed dead, or wiring
-- expiry_items up if the Expiry Tracker module gets built — it may
-- overlap heavily with inventory_items.expiry_date.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  asset_type  text NOT NULL CHECK (asset_type IN ('stock','gold','silver','crypto','other')),
  symbol      text NOT NULL,
  name        text NOT NULL,
  quantity    numeric NOT NULL,
  buy_price   numeric NOT NULL,
  buy_date    date NOT NULL,
  currency    text DEFAULT 'USD',
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own holdings"
  ON public.portfolio_holdings FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS portfolio_holdings_user_id_asset_type_idx ON public.portfolio_holdings(user_id, asset_type);

CREATE TABLE IF NOT EXISTS public.expiry_items (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  category     text NOT NULL,
  expiry_date  date NOT NULL,
  quantity     text,
  notes        text,
  notified     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.expiry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own expiry items"
  ON public.expiry_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS expiry_items_user_id_expiry_date_idx ON public.expiry_items(user_id, expiry_date);
