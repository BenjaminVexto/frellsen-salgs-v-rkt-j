CREATE OR REPLACE FUNCTION public.maskiner_uden_aftale_og_aflaesning()
RETURNS TABLE(unit_id uuid, afdeling_nr integer, company_id uuid, company_navn text, saelger_navn text, adresse text, kundenr text, maskintype text, serienr text, kilde text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin';
  END IF;
  RETURN QUERY
  SELECT u.id, l.afdeling_nr, c.id, c.name,
         coalesce(p.full_name, ''),
         concat_ws(', ', l.address, concat_ws(' ', l.zip, l.city)),
         l.visma_delivery_no, u.machine_type, u.serial_no, u.source
  FROM public.location_equipment_units u
  JOIN public.locations l ON l.id = u.location_id
  JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.profiles p ON p.id = l.saelger_user_id
  WHERE NOT u.is_filter AND NOT coalesce(u.is_free_loan, false)
    AND coalesce(trim(u.agreement_type), '') = ''
    AND NOT EXISTS (SELECT 1 FROM public.machine_enrichment e
                    WHERE e.serienr = u.serial_no AND e.record_status = 'aktiv'
                      AND (e.aftale_type IS NOT NULL OR e.taelleraflaesning IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM public.machines m
                    WHERE m.serienr = u.serial_no AND m.record_status = 'aktiv' AND m.udlanstype IS NOT NULL)
  ORDER BY c.name, 7, u.machine_type;
END;
$$;
REVOKE ALL ON FUNCTION public.maskiner_uden_aftale_og_aflaesning() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maskiner_uden_aftale_og_aflaesning() TO authenticated, service_role;