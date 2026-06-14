
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_enrichment TO authenticated;
GRANT ALL ON public.machine_enrichment TO service_role;
