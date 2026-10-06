CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner_detaljer(_saelger uuid, _fra date, _til date, _maerke text, _brugt boolean DEFAULT NULL::boolean, _kundetype text DEFAULT 'alle'::text, _maaned date DEFAULT NULL::date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(company_id uuid, navn text, by text, model text, antal numeric, faktura_dato date, beloeb numeric, brugt boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.afdeling_nr = ANY (_afd) AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT c.id, c.name, c.city, il.varetekst, il.antal, il.faktura_dato,
         round(coalesce(il.beloeb, 0), 2), (il.varetekst ILIKE '%brugt%')
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = ANY (_afd)
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND NOT public.maskin_er_tilvalg(il.varetekst)
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR il.period = date_trunc('month', _maaned)::date)
    AND (_saelger IS NULL OR loc.saelger_user_id = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (_maerke IS NULL OR _maerke = public.maskin_maerke(il.varetekst))
    AND (_brugt IS NULL OR _brugt = (il.varetekst ILIKE '%brugt%'))
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  ORDER BY il.faktura_dato;
END;
$function$;