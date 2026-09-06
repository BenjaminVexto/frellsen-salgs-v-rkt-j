ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS afloest_af_company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_afloest_af_company_id_idx
  ON public.companies (afloest_af_company_id);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_afloest_af_not_self;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_afloest_af_not_self
  CHECK (afloest_af_company_id IS NULL OR afloest_af_company_id <> id);