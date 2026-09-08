DROP FUNCTION IF EXISTS public.rebuild_sales_aggregates(date, date);

CREATE OR REPLACE FUNCTION public.rebuild_top_products(_kun_afdelinger int[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rows int;
  _from date := (date_trunc('month', current_date) - interval '11 months')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin kan genberegne aggregater';
  END IF;

  DELETE FROM public.sales_top_products
  WHERE _kun_afdelinger IS NULL OR afdeling_nr = ANY(_kun_afdelinger);

  WITH src AS (
    SELECT il.*
    FROM public.invoice_lines il
    WHERE il.period >= _from
      AND (_kun_afdelinger IS NULL OR il.afdeling_nr = ANY(_kun_afdelinger))
      AND NOT (il.beloeb = 0 AND il.db IS DISTINCT FROM 0 AND il.db IS NOT NULL)
      AND COALESCE(btrim(il.varenr), '') <> ''
  ), agg AS (
    SELECT afdeling_nr, visma_delivery_no, btrim(varenr) AS varenr,
           round(COALESCE(SUM(beloeb), 0), 2) AS revenue,
           round(COALESCE(SUM(antal), 0), 3) AS quantity,
           round(COALESCE(SUM(db), 0), 2) AS contribution,
           (array_agg(btrim(varetekst) ORDER BY id)
              FILTER (WHERE COALESCE(btrim(varetekst), '') <> ''))[1] AS description,
           (array_agg(btrim(varegruppe_1) ORDER BY id)
              FILTER (WHERE COALESCE(btrim(varegruppe_1), '') NOT IN ('', '0')))[1] AS product_group_1
    FROM src
    GROUP BY afdeling_nr, visma_delivery_no, btrim(varenr)
  ), ranked AS (
    SELECT a.*, row_number() OVER (
      PARTITION BY a.afdeling_nr, a.visma_delivery_no ORDER BY a.revenue DESC, a.varenr
    ) AS rn
    FROM agg a
  )
  INSERT INTO public.sales_top_products
    (location_id, visma_delivery_no, varenr, description, revenue, quantity,
     contribution, product_group_1, afdeling_nr)
  SELECT l.id, r.visma_delivery_no, r.varenr, r.description, r.revenue, r.quantity,
         r.contribution, COALESCE(r.product_group_1, '0'), r.afdeling_nr
  FROM ranked r
  LEFT JOIN public.locations l
    ON l.visma_delivery_no = r.visma_delivery_no AND l.afdeling_nr = r.afdeling_nr
  WHERE r.rn <= 15;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rebuild_sales_aggregates(
  _from date,
  _to date,
  _kun_afdelinger int[] DEFAULT NULL,
  _med_top boolean DEFAULT true
)
RETURNS TABLE(maaned date, monthly_rows integer, product_rows integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Sletningen fjerner spøgelsesrækker fra tidligere importer.
    DELETE FROM public.sales_monthly
    WHERE period = _m
      AND (_kun_afdelinger IS NULL OR afdeling_nr = ANY(_kun_afdelinger));
    DELETE FROM public.sales_monthly_products
    WHERE period = _m
      AND (_kun_afdelinger IS NULL OR afdeling_nr = ANY(_kun_afdelinger));

    WITH src AS (
      SELECT il.*,
             (il.beloeb = 0 AND il.db IS DISTINCT FROM 0 AND il.db IS NOT NULL) AS is_internal,
             COALESCE(NULLIF(btrim(il.varegruppe_1), ''), '0') AS grp
      FROM public.invoice_lines il
      WHERE il.period = _m
        AND (_kun_afdelinger IS NULL OR il.afdeling_nr = ANY(_kun_afdelinger))
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
    INSERT INTO public.sales_monthly
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
        AND (_kun_afdelinger IS NULL OR il.afdeling_nr = ANY(_kun_afdelinger))
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
    INSERT INTO public.sales_monthly_products
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

  -- Top-varer er en rullende 12-måneders liste fra rådata, uafhængig af filens periode.
  IF _med_top THEN
    PERFORM public.rebuild_top_products(_kun_afdelinger);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.rebuild_sales_aggregates(date, date, int[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_top_products(int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_sales_aggregates(date, date, int[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_top_products(int[]) TO authenticated, service_role;