ALTER TABLE public.bonus_ordning
  ADD COLUMN IF NOT EXISTS overtagelse_mdr integer NOT NULL DEFAULT 3;