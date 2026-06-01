-- Tillad flere virksomheder pr. CVR (søsterselskaber / koncernenheder)
-- Hver Visma kundenr forbliver en selvstændig virksomhed; CVR er en relation, ikke en nøgle.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_cvr_key;
DROP INDEX IF EXISTS public.companies_cvr_key;
DROP INDEX IF EXISTS public.companies_cvr_unique;

-- Hurtigt opslag på CVR for søsterselskab-visningen
CREATE INDEX IF NOT EXISTS companies_cvr_idx
  ON public.companies (cvr)
  WHERE cvr IS NOT NULL AND cvr <> '';