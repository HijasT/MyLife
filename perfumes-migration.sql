-- ============================================================
--  MyLife — Perfumes Module Migration
--  Run this in: Supabase → SQL Editor → New query
-- ============================================================

-- Extend existing perfumes table with Aromatica fields
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS status text DEFAULT 'wardrobe';
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS rating_stars numeric(3,1);
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS notes_tags text[] DEFAULT '{}';
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS weather_tags text[] DEFAULT '{}';
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS gender_scale int DEFAULT 2;
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS notes_text text;
ALTER TABLE public.perfumes ADD COLUMN IF NOT EXISTS archive_reason text;

-- Perfume bottles
CREATE TABLE IF NOT EXISTS public.perfume_bottles (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  perfume_id      uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  bottle_size_ml  numeric(6,1) NOT NULL DEFAULT 100,
  bottle_type     text NOT NULL DEFAULT 'Full bottle',
  status          text NOT NULL DEFAULT 'In collection',
  usage           text DEFAULT 'Casual',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_bottles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bottles"
  ON public.perfume_bottles FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS perfume_bottles_perfume_id ON public.perfume_bottles(perfume_id);

-- Perfume purchases
CREATE TABLE IF NOT EXISTS public.perfume_purchases (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  perfume_id  uuid REFERENCES public.perfumes(id) ON DELETE CASCADE NOT NULL,
  bottle_id   uuid REFERENCES public.perfume_bottles(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date        date NOT NULL,
  ml          numeric(6,1) DEFAULT 0,
  price       numeric(10,2) DEFAULT 0,
  currency    text DEFAULT 'AED',
  shop_name   text DEFAULT 'Unknown',
  shop_link   text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.perfume_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own purchases"
  ON public.perfume_purchases FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS perfume_purchases_perfume_id ON public.perfume_purchases(perfume_id);
CREATE INDEX IF NOT EXISTS perfume_purchases_date ON public.perfume_purchases(user_id, date DESC);

-- Add display_name to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
