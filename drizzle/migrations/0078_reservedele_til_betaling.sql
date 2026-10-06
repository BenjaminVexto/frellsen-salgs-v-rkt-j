CREATE OR REPLACE FUNCTION public.reservedele_til_betaling(_saelger uuid)
RETURNS TABLE(serienr text, maskintype text, dato date, location_id uuid, company_id uuid, virksomhed text, adresse text, by text, saelger_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF (_saelger IS NULL OR _saelger <> auth.uid())
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'salgssupport')) THEN
    RAISE EXCEPTION 'Ingen adgang';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (e.serienr) e.serienr, u.machine_type, (e.data->>'reservedele_efter')::date, l.id, l.company_id, c.name, l.address, l.city, l.saelger_user_id
  FROM machine_enrichment e
  JOIN location_equipment_units u ON btrim(u.serial_no) = e.serienr AND NOT u.is_filter
  JOIN locations l ON l.id = u.location_id
  JOIN companies c ON c.id = l.company_id
  WHERE e.record_status = 'aktiv'
    AND (e.data->>'reservedele_efter') ~ '^\d{4}-\d{2}-\d{2}'
    AND (e.data->>'reservedele_efter')::date > current_date
    AND (e.data->>'reservedele_efter')::date <= current_date + interval '6 months'
    AND (_saelger IS NULL OR l.saelger_user_id = _saelger)
  ORDER BY e.serienr;
END $function$;
REVOKE ALL ON FUNCTION public.reservedele_til_betaling(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservedele_til_betaling(uuid) TO authenticated, service_role;