ALTER TABLE public.invoice_import_jobs
  ADD COLUMN IF NOT EXISTS total_top_monthly integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_top_monthly integer NOT NULL DEFAULT 0;