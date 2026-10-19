CREATE OR REPLACE FUNCTION public.bonus_nykunde_rangliste(_maaned date)
RETURNS TABLE(saelger uuid, navn text, db numeric, rang integer, beloeb numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() OR NOT (
    public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'saelger') OR public.has_role(auth.uid(), 'salgssupport')
  ) THEN RAISE EXCEPTION 'Ingen adgang til bonuskonkurrencen'; END IF;
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
  ), pr AS (
    SELECT n.maaned, f.saelger, sum(f.contrib) AS db FROM nye n
    JOIN public.sales_kunde_maaned f ON f.afdeling_nr = 11 AND f.period = n.maaned AND f.company_id = n.company_id
    JOIN public.companies c ON c.id = n.company_id
    WHERE f.saelger IS NOT NULL AND coalesce(c.customer_segment_3, '') NOT LIKE '40%' GROUP BY 1, 2
  ), berettiget AS (
    SELECT pr.* FROM pr WHERE EXISTS (
      SELECT 1 FROM public.bonus_ordning b WHERE b.user_id = pr.saelger AND b.gyldig_fra <= pr.maaned
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= pr.maaned)
      AND b.flatrate IS NULL AND coalesce(b.db_provision_pct, 0) > 0)
  ), rangeret AS (
    SELECT b.*, (rank() OVER (PARTITION BY b.maaned ORDER BY b.db DESC))::int AS rang FROM berettiget b WHERE b.db > 0
  )
  SELECT r.saelger, coalesce(p.full_name, 'Ukendt sælger'), round(r.db, 2), r.rang,
    (CASE r.rang WHEN 1 THEN 1000 WHEN 2 THEN 600 ELSE 0 END)::numeric
  FROM rangeret r LEFT JOIN public.profiles p ON p.id = r.saelger ORDER BY r.rang, p.full_name;
END;
$function$;
REVOKE ALL ON FUNCTION public.bonus_nykunde_rangliste(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_nykunde_rangliste(date) TO authenticated, service_role;
COMMENT ON FUNCTION public.bonus_nykunde_rangliste(date) IS 'Shared internal leaderboard only: same eligibility, raw DB ranking and prizes as ny_kunde_bonus_maaned; no customer-level data; telemarketing denied.';