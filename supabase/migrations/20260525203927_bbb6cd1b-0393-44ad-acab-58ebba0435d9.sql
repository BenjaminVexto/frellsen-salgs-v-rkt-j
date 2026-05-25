ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS companies_assigned_to_idx ON public.companies(assigned_to);