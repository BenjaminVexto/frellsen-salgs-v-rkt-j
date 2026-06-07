ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS binding_status text,
  ADD COLUMN IF NOT EXISTS customer_category text;

CREATE INDEX IF NOT EXISTS companies_binding_status_idx ON public.companies(binding_status);
