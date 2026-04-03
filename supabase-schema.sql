-- ============================================================
-- MyLife App — Complete Supabase Schema (Current / Accurate)
-- Run in: Supabase → SQL Editor → New query
-- Last updated: 2026-04
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES — extends auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email             text,
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
  group_name        text NOT NULL DEFAULT 'General',
  due_date_day      int,            -- day of month (1-31)
  statement_date    int,            -- statement day of month
  default_currency  text DEFAULT 'AED',
  default_amount    numeric,
  is_fixed          boolean DEFAULT false,
  is_hidden         boolean DEFAULT false,
  is_remittance     boolean DEFAULT false,
  sort_order        int DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.due_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own due items"
  ON public.due_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_items_user ON public.due_items(user_id);

CREATE TABLE IF NOT EXISTS public.due_entries (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  due_item_id   uuid REFERENCES public.due_items(id) ON DELETE CASCADE NOT NULL,
  month         text NOT NULL,      -- YYYY-MM
  amount        numeric,
  currency      text DEFAULT 'AED',
  status        text DEFAULT 'pending' CHECK (status IN ('pending','paid','skipped')),
  paid_at       timestamptz,
  note          text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(due_item_id, month)
);

ALTER TABLE public.due_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own due entries"
  ON public.due_entries FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS due_entries_user_month ON public.due_entries(user_id, month);

CREATE TABLE IF NOT EXISTS public.due_month_settings (
  id               uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  month            text NOT NULL,   -- YYYY-MM
  main_currency    text DEFAULT 'AED',
  note             text,
  cash_in          jsonb DEFAULT '{}',
  fx_rates         jsonb DEFAULT '{"INR":25.2,"USD":3.67}',
  groups           text[] DEFAULT '{"UAE","India"}',
  remittance_inr   numeric,
  remittance_rate  numeric,
  remittance_paid  boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.due_month_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own month settings"
  ON public.due_month_settings FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- PORTFOLIO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id                       uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                  uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  symbol                   text NOT NULL,
  name                     text NOT NULL,
  asset_type               text NOT NULL CHECK (asset_type IN ('gold','silver','stock','crypto','other')),
  unit_label               text DEFAULT 'unit',
  main_currency            text DEFAULT 'AED',
  current_price            numeric,
  current_price_updated_at timestamptz,
  notes                    text,    -- also stores liveprice:KEY||usernotes
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own portfolio items"
  ON public.portfolio_items FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.portfolio_purchases (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  item_id      uuid REFERENCES public.portfolio_items(id) ON DELETE CASCADE NOT NULL,
  purchased_at timestamptz NOT NULL,
  unit_price   numeric NOT NULL,
  units        numeric NOT NULL,
  total_paid   numeric NOT NULL,
  currency     text DEFAULT 'AED',
  source       text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own portfolio purchases"
  ON public.portfolio_purchases FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS portfolio_purchases_item ON public.portfolio_purchases(item_id);

-- ============================================================
-- CALENDAR
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date          date NOT NULL,
  title         text NOT NULL,
  event_type    text NOT NULL DEFAULT 'event'
                  CHECK (event_type IN ('work','birthday','event','due_paid','note')),
  source_module text DEFAULT 'manual',
  source_id     text,
  work_start    text,     -- HH:MM 24h
  work_end      text,     -- HH:MM 24h
  color         text,
  notes         text,
  is_recurring  boolean DEFAULT false,
  recur_type    text,     -- 'yearly'
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own calendar events"
  ON public.calendar_events FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS calendar_events_user_date ON public.calendar_events(user_id, date DESC);

-- ============================================================
-- AROMATICA (Perfumes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfumes (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  brand             text NOT NULL,
  model             text NOT NULL,
  status            text DEFAULT 'wardrobe' CHECK (status IN ('wardrobe','wishlist','archive')),
  image_url         text,
  rating_stars      int CHECK (rating_stars BETWEEN 1 AND 5),
  notes_tags        text[] DEFAULT '{}',
  weather_tags      text[] DEFAULT '{}',
  gender_scale      int DEFAULT 2 CHECK (gender_scale BETWEEN 0 AND 4),
  longevity         text,
  sillage           text,
  value_rating      text DEFAULT 'Neutral',
  clone_similar     text,
  notes_text        text,
  purchase_priority text DEFAULT 'Medium',
  target_price_aed  numeric,
  preferred_shop    text,
  archived_at       timestamptz,
  resale_price_aed  numeric,
  archive_notes     text,
  archive_reason    text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.perfumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own perfumes"
  ON public.perfumes FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS perfumes_user_brand ON public.perfumes(user_id, brand);

CREATE TABLE IF NOT EXISTS public.perfume_bottles (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  perfume_id      uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  bottle_size_ml  numeric DEFAULT 100,
  bottle_type     text DEFAULT 'Full bottle',
  status          text DEFAULT 'In collection',
  usage           text,   -- stores price paid
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_bottles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own perfume bottles"
  ON public.perfume_bottles FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.perfume_purchases (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  perfume_id  uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  bottle_id   uuid REFERENCES public.perfume_bottles(id) ON DELETE SET NULL,
  date        date NOT NULL,
  ml          numeric,
  price       numeric DEFAULT 0,
  currency    text DEFAULT 'AED',
  shop_name   text,
  shop_link   text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own perfume purchases"
  ON public.perfume_purchases FOR ALL USING (auth.uid() = user_id);

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
CREATE INDEX IF NOT EXISTS biomarker_results_date ON public.biomarker_results(user_id, test_date DESC);

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
