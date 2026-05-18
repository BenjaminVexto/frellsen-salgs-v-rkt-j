-- Tillad CVR at være NULL og ryd op i syntetiske NO-CVR poster
ALTER TABLE public.companies ALTER COLUMN cvr DROP NOT NULL;

UPDATE public.companies
SET cvr = NULL, source = COALESCE(source, 'csv_uden_cvr')
WHERE cvr LIKE 'NO-CVR-%';

-- Unikt CVR når sat (delvis unik index)
DROP INDEX IF EXISTS companies_cvr_unique;
CREATE UNIQUE INDEX companies_cvr_unique ON public.companies (cvr) WHERE cvr IS NOT NULL;