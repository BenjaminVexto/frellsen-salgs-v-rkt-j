ALTER TABLE public.invoice_import_jobs
  ADD COLUMN IF NOT EXISTS aggregate_month_idx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS months_rebuilt integer NOT NULL DEFAULT 0;