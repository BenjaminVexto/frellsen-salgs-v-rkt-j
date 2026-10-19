CREATE OR REPLACE FUNCTION public.bonus_nykunde_detaljer(_saelger uuid, _maaned date)
RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() OR NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til kundedetaljer'; END IF;
  RETURN QUERY
  WITH m AS (
    SELECT date_trunc('month', _maaned)::date AS maaned
    WHERE _maaned >= DATE '2026-09-01' AND date_trunc('month', _maaned) < date_trunc('month', current_date)
  ), kunder AS (
    SELECT m.maaned, f.company_id FROM m JOIN public.sales_kunde_maaned f ON f.afdeling_nr = 11 AND f.period = m.maaned
    GROUP BY 1, 2 HAVING sum(f.rev) > 0
  ), nye AS (
    SELECT k.maaned, k.company_id FROM kunder k WHERE NOT EXISTS (
      SELECT 1 FROM public.sales_kunde_maaned g WHERE g.afdeling_nr = 11 AND g.company_id = k.company_id
      AND g.period >= (k.maaned - interval '24 months')::date AND g.period < k.maaned AND g.rev <> 0)
  )
  SELECT n.company_id, c.name, c.city, round(sum(f.contrib), 2), round(sum(f.rev), 2) FROM nye n
  JOIN public.sales_kunde_maaned f ON f.afdeling_nr = 11 AND f.period = n.maaned AND f.company_id = n.company_id
  JOIN public.companies c ON c.id = n.company_id
  WHERE f.saelger = _saelger AND coalesce(c.customer_segment_3, '') NOT LIKE '40%'
  GROUP BY n.company_id, c.name, c.city ORDER BY 4 DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.bonus_nykunde_detaljer(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_nykunde_detaljer(uuid, date) TO authenticated, service_role;
COMMENT ON FUNCTION public.bonus_nykunde_detaljer(uuid, date) IS 'New-customer DB per customer behind the leaderboard; only own seller (or admin/salgssupport via maalepunkt_adgang).';