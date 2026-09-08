-- 1. Kundetype-filter på maskintabellen (beregning uændret)
CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner(_saelger uuid, _fra date, _til date, _kundetype text DEFAULT 'alle')
 RETURNS TABLE(maaned date, maerke text, brugt boolean, antal numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT il.period AS maaned,
         CASE
           WHEN il.varetekst ILIKE '%wittenborg%' THEN 'Wittenborg'
           WHEN il.varetekst ILIKE '%animo%'
             OR il.varetekst ILIKE '%optivend%'
             OR il.varetekst ILIKE '%optibean%'
             OR il.varetekst ILIKE '%optime%' THEN 'Animo'
           WHEN il.varetekst ILIKE '%rex-royal%' THEN 'Rex-Royal'
           ELSE 'Andet'
         END AS maerke,
         (il.varetekst ILIKE '%brugt%') AS brugt,
         sum(il.antal) AS antal
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = 11
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND coalesce(il.varetekst, '') NOT ILIKE 'serienr%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%skab%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%udslagsskuffe%'
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR (_kundetype = 'privat' AND c.binding_status = 'frit_salg')
         OR (_kundetype = 'offentlig' AND c.binding_status = 'offentlig_aftale'))
  GROUP BY 1, 2, 3;
END;
$function$;

-- 2. Detaljer: dækningsbidrag
CREATE OR REPLACE FUNCTION public.maalepunkt_db_detaljer(
  _saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL)
 RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.city,
         round(sum(sm.contribution), 2),
         round(sum(sm.revenue), 2)
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR sm.period = date_trunc('month', _maaned)::date)
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND (CASE c.binding_status
           WHEN 'frit_salg' THEN 'privat'
           WHEN 'offentlig_aftale' THEN 'offentlig'
           ELSE 'andet' END) = _kategori
  GROUP BY c.id, c.name, c.city
  ORDER BY 4 DESC;
END;
$function$;

-- 3. Detaljer: solgte maskiner
CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner_detaljer(
  _saelger uuid, _fra date, _til date, _maerke text,
  _brugt boolean DEFAULT NULL, _kundetype text DEFAULT 'alle', _maaned date DEFAULT NULL)
 RETURNS TABLE(company_id uuid, navn text, by text, model text, antal numeric,
               faktura_dato date, beloeb numeric, brugt boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT c.id, c.name, c.city, il.varetekst, il.antal, il.faktura_dato,
         round(coalesce(il.beloeb, 0), 2), (il.varetekst ILIKE '%brugt%')
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = 11
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND coalesce(il.varetekst, '') NOT ILIKE 'serienr%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%skab%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%udslagsskuffe%'
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR il.period = date_trunc('month', _maaned)::date)
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND (_maerke IS NULL OR _maerke = (CASE
           WHEN il.varetekst ILIKE '%wittenborg%' THEN 'Wittenborg'
           WHEN il.varetekst ILIKE '%animo%'
             OR il.varetekst ILIKE '%optivend%'
             OR il.varetekst ILIKE '%optibean%'
             OR il.varetekst ILIKE '%optime%' THEN 'Animo'
           WHEN il.varetekst ILIKE '%rex-royal%' THEN 'Rex-Royal'
           ELSE 'Andet' END))
    AND (_brugt IS NULL OR _brugt = (il.varetekst ILIKE '%brugt%'))
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR (_kundetype = 'privat' AND c.binding_status = 'frit_salg')
         OR (_kundetype = 'offentlig' AND c.binding_status = 'offentlig_aftale'))
  ORDER BY il.faktura_dato;
END;
$function$;

-- 4. Detaljer: nye kunder
CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder_detaljer(
  _saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL)
 RETURNS TABLE(company_id uuid, navn text, by text, oprettet date,
               kundeprisgruppe_2 text, omsaetning numeric, sidste_koeb date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.city, c.created_in_visma, c.customer_segment_2,
         round(coalesce(s.omsaetning, 0), 2), s.sidste_koeb
  FROM public.companies c
  LEFT JOIN LATERAL (
    SELECT sum(sm.revenue) AS omsaetning, max(sm.last_invoice_date) AS sidste_koeb
    FROM public.sales_monthly sm
    WHERE sm.company_id = c.id
      AND sm.afdeling_nr = 11
      AND sm.period >= date_trunc('month', c.created_in_visma)::date
  ) s ON true
  WHERE c.afdeling_nr = 11
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND c.created_in_visma IS NOT NULL
    AND date_trunc('month', c.created_in_visma)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', c.created_in_visma)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', c.created_in_visma)::date < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR date_trunc('month', c.created_in_visma)::date = date_trunc('month', _maaned)::date)
    AND (CASE c.binding_status
           WHEN 'frit_salg' THEN 'privat'
           WHEN 'offentlig_aftale' THEN 'offentlig'
           ELSE 'andet' END) = _kategori
  ORDER BY c.created_in_visma;
END;
$function$;

REVOKE ALL ON FUNCTION public.maalepunkt_db_detaljer(uuid, date, date, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.maalepunkt_maskiner_detaljer(uuid, date, date, text, boolean, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.maalepunkt_db_detaljer(uuid, date, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_maskiner_detaljer(uuid, date, date, text, boolean, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date) TO authenticated;