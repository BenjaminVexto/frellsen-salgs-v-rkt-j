ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS maskiner_folger_hovedaftale boolean NOT NULL DEFAULT false;