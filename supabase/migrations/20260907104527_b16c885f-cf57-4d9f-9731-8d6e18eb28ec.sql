
-- 1. Shadow tables
CREATE TABLE IF NOT EXISTS public.sales_monthly_rebuilt (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id uuid,
  company_id uuid,
  visma_delivery_no text NOT NULL,
  period date NOT NULL,
  product_group_1 text NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  contribution numeric NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric NOT NULL DEFAULT 0,
  last_invoice_date date,
  afdeling_nr integer NOT NULL DEFAULT 11
);

CREATE TABLE IF NOT EXISTS public.sales_monthly_products_rebuilt (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id uuid,
  visma_delivery_no text NOT NULL,
  period date NOT NULL,
  varenr text NOT NULL,
  description text,
  revenue numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  contribution numeric NOT NULL DEFAULT 0,
  product_group_1 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  afdeling_nr integer NOT NULL DEFAULT 11,
  weight_kg numeric NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_monthly_rebuilt_unique ON public.sales_monthly_rebuilt (afdeling_nr, visma_delivery_no, period, product_group_1);
CREATE INDEX IF NOT EXISTS sales_monthly_rebuilt_company_period_idx ON public.sales_monthly_rebuilt (company_id, period);
CREATE INDEX IF NOT EXISTS sales_monthly_rebuilt_location_period_idx ON public.sales_monthly_rebuilt (location_id, period);
CREATE INDEX IF NOT EXISTS sales_monthly_rebuilt_delivery_idx ON public.sales_monthly_rebuilt (visma_delivery_no);
CREATE INDEX IF NOT EXISTS sales_monthly_rebuilt_afdeling_idx ON public.sales_monthly_rebuilt (afdeling_nr);
CREATE INDEX IF NOT EXISTS sales_monthly_rebuilt_afdeling_period_idx ON public.sales_monthly_rebuilt (afdeling_nr, period);

CREATE UNIQUE INDEX IF NOT EXISTS sales_monthly_products_rebuilt_unique ON public.sales_monthly_products_rebuilt (afdeling_nr, visma_delivery_no, period, varenr);
CREATE INDEX IF NOT EXISTS sales_monthly_products_rebuilt_delivery_period_idx ON public.sales_monthly_products_rebuilt (visma_delivery_no, period);
CREATE INDEX IF NOT EXISTS sales_monthly_products_rebuilt_location_idx ON public.sales_monthly_products_rebuilt (location_id);
CREATE INDEX IF NOT EXISTS sales_monthly_products_rebuilt_location_period_idx ON public.sales_monthly_products_rebuilt (location_id, period);
CREATE INDEX IF NOT EXISTS sales_monthly_products_rebuilt_afdeling_idx ON public.sales_monthly_products_rebuilt (afdeling_nr);

GRANT SELECT ON public.sales_monthly_rebuilt TO authenticated;
GRANT SELECT ON public.sales_monthly_products_rebuilt TO authenticated;
GRANT ALL ON public.sales_monthly_rebuilt TO service_role;
GRANT ALL ON public.sales_monthly_products_rebuilt TO service_role;

ALTER TABLE public.sales_monthly_rebuilt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_monthly_products_rebuilt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin kan laese rebuilt monthly" ON public.sales_monthly_rebuilt;
CREATE POLICY "Admin kan laese rebuilt monthly" ON public.sales_monthly_rebuilt
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin kan laese rebuilt products" ON public.sales_monthly_products_rebuilt;
CREATE POLICY "Admin kan laese rebuilt products" ON public.sales_monthly_products_rebuilt
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 2. Rebuild function
CREATE OR REPLACE FUNCTION public.rebuild_sales_aggregates(_from date, _to date)
RETURNS TABLE(maaned date, monthly_rows int, product_rows int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m date;
  _end date;
  _mrows int;
  _prows int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin kan genberegne aggregater';
  END IF;

  _m := date_trunc('month', _from::timestamp)::date;
  _end := date_trunc('month', _to::timestamp)::date;

  WHILE _m <= _end LOOP
    DELETE FROM public.sales_monthly_rebuilt WHERE period = _m;
    DELETE FROM public.sales_monthly_products_rebuilt WHERE period = _m;

    WITH src AS (
      SELECT il.*,
             (il.beloeb = 0 AND il.db IS DISTINCT FROM 0 AND il.db IS NOT NULL) AS is_internal,
             COALESCE(NULLIF(btrim(il.varegruppe_1), ''), '0') AS grp
      FROM public.invoice_lines il
      WHERE il.period = _m
    ), agg AS (
      SELECT afdeling_nr, visma_delivery_no, _m AS period, grp AS product_group_1,
             round(COALESCE(SUM(CASE WHEN NOT is_internal THEN beloeb END), 0), 2) AS revenue,
             round(COALESCE(SUM(CASE WHEN NOT is_internal THEN antal END), 0), 3) AS quantity,
             round(COALESCE(SUM(db), 0), 2) AS contribution,
             round(COALESCE(SUM(CASE WHEN NOT is_internal THEN nettovaegt END), 0), 3) AS weight_kg,
             COUNT(DISTINCT CASE WHEN NOT is_internal AND COALESCE(btrim(ordre_nr), '') <> '' THEN btrim(ordre_nr) END) AS order_count,
             MAX(faktura_dato) AS last_invoice_date
      FROM src
      GROUP BY afdeling_nr, visma_delivery_no, grp
    )
    INSERT INTO public.sales_monthly_rebuilt
      (location_id, company_id, visma_delivery_no, period, product_group_1,
       revenue, quantity, contribution, order_count, weight_kg, last_invoice_date, afdeling_nr)
    SELECT l.id, l.company_id, a.visma_delivery_no, a.period, a.product_group_1,
           a.revenue, a.quantity, a.contribution, a.order_count, a.weight_kg, a.last_invoice_date, a.afdeling_nr
    FROM agg a
    LEFT JOIN public.locations l
      ON l.visma_delivery_no = a.visma_delivery_no AND l.afdeling_nr = a.afdeling_nr;

    GET DIAGNOSTICS _mrows = ROW_COUNT;

    WITH src AS (
      SELECT il.*
      FROM public.invoice_lines il
      WHERE il.period = _m
        AND NOT (il.beloeb = 0 AND il.db IS DISTINCT FROM 0 AND il.db IS NOT NULL)
        AND COALESCE(btrim(il.varenr), '') <> ''
    ), agg AS (
      SELECT afdeling_nr, visma_delivery_no, _m AS period, btrim(varenr) AS varenr,
             round(COALESCE(SUM(beloeb), 0), 2) AS revenue,
             round(COALESCE(SUM(antal), 0), 3) AS quantity,
             round(COALESCE(SUM(db), 0), 2) AS contribution,
             round(COALESCE(SUM(nettovaegt), 0), 3) AS weight_kg,
             (array_agg(btrim(varetekst) ORDER BY id)
                FILTER (WHERE COALESCE(btrim(varetekst), '') <> ''))[1] AS description,
             (array_agg(btrim(varegruppe_1) ORDER BY id)
                FILTER (WHERE COALESCE(btrim(varegruppe_1), '') NOT IN ('', '0')))[1] AS product_group_1
      FROM src
      GROUP BY afdeling_nr, visma_delivery_no, btrim(varenr)
    )
    INSERT INTO public.sales_monthly_products_rebuilt
      (location_id, visma_delivery_no, period, varenr, description,
       revenue, quantity, contribution, weight_kg, product_group_1, afdeling_nr)
    SELECT l.id, a.visma_delivery_no, a.period, a.varenr, a.description,
           a.revenue, a.quantity, a.contribution, a.weight_kg, a.product_group_1, a.afdeling_nr
    FROM agg a
    LEFT JOIN public.locations l
      ON l.visma_delivery_no = a.visma_delivery_no AND l.afdeling_nr = a.afdeling_nr;

    GET DIAGNOSTICS _prows = ROW_COUNT;

    maaned := _m;
    monthly_rows := _mrows;
    product_rows := _prows;
    RETURN NEXT;

    _m := (_m + interval '1 month')::date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_sales_aggregates(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_sales_aggregates(date, date) TO service_role, authenticated;

-- 3. Compare function
CREATE OR REPLACE FUNCTION public.compare_sales_aggregates(_from date, _to date)
RETURNS TABLE(maaned date, afdeling_nr int, kilde text, monthly_rows bigint,
              monthly_revenue numeric, monthly_kg numeric, product_rows bigint, product_revenue numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.compare_sales_aggregates(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compare_sales_aggregates(date, date) TO service_role, authenticated;
