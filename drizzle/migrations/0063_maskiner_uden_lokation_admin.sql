CREATE OR REPLACE FUNCTION public.maskiner_uden_lokation()
RETURNS TABLE(machine_id text, afdeling_nr int, serienr text, varenr text, beskrivelse text, udlanstype text,
              navn text, lev_kundenr text, fak_kundenr text, adresse text,
              company_id uuid, company_navn text, saelger_navn text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.id, m.afdeling_nr, m.serienr, m.varenr, m.beskrivelse, m.udlanstype,
         m.navn, m.lev_kundenr, m.fak_kundenr, NULLIF(m.adresselinje2, ''),
         c.id, c.name, p.full_name
  FROM public.machines m
  LEFT JOIN LATERAL (
    SELECT l.company_id FROM public.locations l
    WHERE l.afdeling_nr = m.afdeling_nr AND l.visma_delivery_no = m.fak_kundenr
    LIMIT 1) f ON true
  LEFT JOIN public.companies c ON c.id = f.company_id
  LEFT JOIN public.profiles p ON p.id = c.assigned_to
  WHERE m.record_status = 'aktiv'
    AND public.is_admin(auth.uid())
    AND m.afdeling_nr = ANY (public.my_afdelinger())
    AND NOT EXISTS (SELECT 1 FROM public.locations l2
                    WHERE l2.afdeling_nr = m.afdeling_nr AND l2.visma_delivery_no = m.lev_kundenr)
  ORDER BY m.afdeling_nr, c.name NULLS LAST, m.lev_kundenr
$$;
REVOKE ALL ON FUNCTION public.maskiner_uden_lokation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maskiner_uden_lokation() TO authenticated;