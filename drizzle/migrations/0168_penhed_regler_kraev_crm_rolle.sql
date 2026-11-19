ALTER POLICY "Læs afviste forslag" ON public.penhed_forslag_afvist USING (public.er_crm_bruger());
ALTER POLICY "Ret ikke relevante" ON public.penhed_ikke_relevant USING (public.er_crm_bruger());
ALTER POLICY "Slet ikke relevante" ON public.penhed_ikke_relevant USING (public.er_crm_bruger());