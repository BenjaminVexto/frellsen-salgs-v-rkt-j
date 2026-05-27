ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS main_branch_code text,
  ADD COLUMN IF NOT EXISTS main_branch_text text,
  ADD COLUMN IF NOT EXISTS bi_branch_1_code text,
  ADD COLUMN IF NOT EXISTS bi_branch_2_code text,
  ADD COLUMN IF NOT EXISTS bi_branch_3_code text,
  ADD COLUMN IF NOT EXISTS cvr_p_enhed_count integer;

CREATE INDEX IF NOT EXISTS idx_companies_main_branch ON public.companies(main_branch_code);
CREATE INDEX IF NOT EXISTS idx_companies_municipality ON public.companies(municipality);
CREATE INDEX IF NOT EXISTS idx_companies_employees ON public.companies(employees);