
CREATE OR REPLACE FUNCTION public.compare_sales_aggregates(_from date, _to date)
RETURNS TABLE(maaned date, afdeling_nr int, kilde text, monthly_rows bigint,
              monthly_revenue numeric, monthly_kg numeric, product_rows bigint, product_revenue numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin kan sammenligne aggregater';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT date_trunc('month', _from::timestamp)::date AS f,
           date_trunc('month', _to::timestamp)::date AS t
  ),
  m_cur AS (
    SELECT sm.period, sm.afdeling_nr, COUNT(*) AS rows, SUM(sm.revenue) AS revenue, SUM(sm.weight_kg) AS kg
    FROM public.sales_monthly sm, bounds b
    WHERE sm.period BETWEEN b.f AND b.t GROUP BY 1, 2
  ),
  p_cur AS (
    SELECT sp.period, sp.afdeling_nr, COUNT(*) AS rows, SUM(sp.revenue) AS revenue
    FROM public.sales_monthly_products sp, bounds b
    WHERE sp.period BETWEEN b.f AND b.t GROUP BY 1, 2
  ),
  m_new AS (
    SELECT sm.period, sm.afdeling_nr, COUNT(*) AS rows, SUM(sm.revenue) AS revenue, SUM(sm.weight_kg) AS kg
    FROM public.sales_monthly_rebuilt sm, bounds b
    WHERE sm.period BETWEEN b.f AND b.t GROUP BY 1, 2
  ),
  p_new AS (
    SELECT sp.period, sp.afdeling_nr, COUNT(*) AS rows, SUM(sp.revenue) AS revenue
    FROM public.sales_monthly_products_rebuilt sp, bounds b
    WHERE sp.period BETWEEN b.f AND b.t GROUP BY 1, 2
  ),
  keys AS (
    SELECT period, afdeling_nr FROM m_cur
    UNION SELECT period, afdeling_nr FROM p_cur
    UNION SELECT period, afdeling_nr FROM m_new
    UNION SELECT period, afdeling_nr FROM p_new
  )
  SELECT k.period, k.afdeling_nr, s.kilde,
         CASE WHEN s.kilde = 'nuvaerende' THEN COALESCE(mc.rows, 0) ELSE COALESCE(mn.rows, 0) END,
         CASE WHEN s.kilde = 'nuvaerende' THEN COALESCE(mc.revenue, 0) ELSE COALESCE(mn.revenue, 0) END,
         CASE WHEN s.kilde = 'nuvaerende' THEN COALESCE(mc.kg, 0) ELSE COALESCE(mn.kg, 0) END,
         CASE WHEN s.kilde = 'nuvaerende' THEN COALESCE(pc.rows, 0) ELSE COALESCE(pn.rows, 0) END,
         CASE WHEN s.kilde = 'nuvaerende' THEN COALESCE(pc.revenue, 0) ELSE COALESCE(pn.revenue, 0) END
  FROM keys k
  CROSS JOIN (VALUES ('nuvaerende'), ('rebuilt')) AS s(kilde)
  LEFT JOIN m_cur mc ON mc.period = k.period AND mc.afdeling_nr = k.afdeling_nr
  LEFT JOIN p_cur pc ON pc.period = k.period AND pc.afdeling_nr = k.afdeling_nr
  LEFT JOIN m_new mn ON mn.period = k.period AND mn.afdeling_nr = k.afdeling_nr
  LEFT JOIN p_new pn ON pn.period = k.period AND pn.afdeling_nr = k.afdeling_nr
  ORDER BY 1, 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.compare_sales_aggregates(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compare_sales_aggregates(date, date) TO service_role, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_sales_aggregates(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_sales_aggregates(date, date) TO service_role, authenticated;
