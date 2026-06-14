DROP INDEX IF EXISTS public.companies_visma_id_unique;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_visma_id_unique UNIQUE (visma_id);