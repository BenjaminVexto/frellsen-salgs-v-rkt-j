CREATE UNIQUE INDEX IF NOT EXISTS locations_one_primary_per_company
ON public.locations(company_id) WHERE is_primary;