CREATE OR REPLACE FUNCTION public.kundestatus(_last_cons date, _last_any date, _has_eq boolean, _ref date DEFAULT NULL)
RETURNS public.customer_type LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  WITH r AS (SELECT coalesce(date_trunc('month', _ref)::date, (date_trunc('month', current_date) - interval '1 month')::date) AS ref)
  SELECT CASE
    WHEN _last_cons IS NOT NULL AND date_trunc('month', _last_cons) >= r.ref - interval '2 months' THEN 'aktiv_kunde'::customer_type
    WHEN _last_cons IS NOT NULL AND date_trunc('month', _last_cons) >= r.ref - interval '11 months' THEN 'sovende_kunde'::customer_type
    WHEN coalesce(_has_eq, false) AND _last_any IS NOT NULL AND date_trunc('month', _last_any) >= r.ref - interval '11 months' THEN 'servicekunde'::customer_type
    WHEN _last_any IS NULL AND _last_cons IS NULL AND NOT coalesce(_has_eq, false) THEN 'nyt_emne'::customer_type
    ELSE 'tidligere_kunde'::customer_type
  END FROM r
$f$;
COMMENT ON FUNCTION public.kundestatus(date,date,boolean,date) IS 'Central kundestatus: aktiv (forbrugsvarer seneste 3 hele mdr.), sovende (4-12 mdr.), servicekunde (aktivt udstyr + anden fakturering inden for 12 mdr.), nyt_emne (aldrig faktureret, intet udstyr), ellers tidligere.';

CREATE OR REPLACE FUNCTION public.recompute_company_statuses_batch(_company_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n integer; _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  WITH last_all AS (
    SELECT company_id, MAX(COALESCE(last_invoice_date, period)) AS d, MAX(period) AS p
    FROM public.sales_monthly
    WHERE company_id = ANY(_company_ids)
      AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0)
    GROUP BY company_id
  ), last_cons AS (
    SELECT company_id, MAX(COALESCE(last_invoice_date, period)) AS d
    FROM public.sales_monthly
    WHERE company_id = ANY(_company_ids)
      AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0)
      AND public.is_consumable_group(product_group_1)
    GROUP BY company_id
  ), last_fb AS (
    SELECT company_id, MAX(period) AS p
    FROM public.sales_monthly
    WHERE company_id = ANY(_company_ids) AND COALESCE(revenue,0) > 0
      AND substring(btrim(coalesce(product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
    GROUP BY company_id
  ), eq AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id = ANY(_company_ids)
  ), eqm AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id = ANY(_company_ids) AND NOT coalesce(u.is_filter, false)
  )
  UPDATE public.companies c
  SET last_sales_date = la.d,
      last_consumable_sales_date = lc.d,
      has_active_equipment = (eq.company_id IS NOT NULL),
      customer_type = public.kundestatus(fb.p, la.p, eqm.company_id IS NOT NULL)
  FROM public.companies cids
  LEFT JOIN last_all la ON la.company_id = cids.id
  LEFT JOIN last_cons lc ON lc.company_id = cids.id
  LEFT JOIN last_fb fb ON fb.company_id = cids.id
  LEFT JOIN eq ON eq.company_id = cids.id
  LEFT JOIN eqm ON eqm.company_id = cids.id
  WHERE c.id = cids.id AND cids.id = ANY(_company_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_all_company_statuses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n integer; _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  WITH last_all AS (
    SELECT company_id, MAX(COALESCE(last_invoice_date, period)) AS d, MAX(period) AS p
    FROM public.sales_monthly
    WHERE company_id IS NOT NULL
      AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0)
    GROUP BY company_id
  ), last_cons AS (
    SELECT company_id, MAX(COALESCE(last_invoice_date, period)) AS d
    FROM public.sales_monthly
    WHERE company_id IS NOT NULL
      AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0)
      AND public.is_consumable_group(product_group_1)
    GROUP BY company_id
  ), last_fb AS (
    SELECT company_id, MAX(period) AS p
    FROM public.sales_monthly
    WHERE company_id IS NOT NULL AND COALESCE(revenue,0) > 0
      AND substring(btrim(coalesce(product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
    GROUP BY company_id
  ), eq AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id IS NOT NULL
  ), eqm AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id IS NOT NULL AND NOT coalesce(u.is_filter, false)
  )
  UPDATE public.companies c
  SET last_sales_date = la.d,
      last_consumable_sales_date = lc.d,
      has_active_equipment = (eq.company_id IS NOT NULL),
      customer_type = public.kundestatus(fb.p, la.p, eqm.company_id IS NOT NULL)
  FROM public.companies cids
  LEFT JOIN last_all la ON la.company_id = cids.id
  LEFT JOIN last_cons lc ON lc.company_id = cids.id
  LEFT JOIN last_fb fb ON fb.company_id = cids.id
  LEFT JOIN eq ON eq.company_id = cids.id
  LEFT JOIN eqm ON eqm.company_id = cids.id
  WHERE c.id = cids.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_company_status(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM public.recompute_company_statuses_batch(ARRAY[_company_id]);
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
        _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH mdr AS (
    SELECT gs::date AS maaned
    FROM generate_series(date_trunc('month', _fra)::date,
      LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date),
      interval '1 month') gs
  ), kunder AS (
    SELECT c.id, public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), oms AS (
    SELECT DISTINCT sm.company_id, sm.period
    FROM public.sales_monthly sm JOIN kunder k ON k.id = sm.company_id
    WHERE sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0
      AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
      AND sm.period >= (date_trunc('month', _fra) - interval '2 months')::date
      AND sm.period < date_trunc('month', current_date)::date
  ), akt AS (
    SELECT DISTINCT m.maaned, o.company_id
    FROM mdr m JOIN oms o ON o.period <= m.maaned AND o.period >= (m.maaned - interval '2 months')::date
  )
  SELECT a.maaned, k.kategori, count(*)::int
  FROM akt a JOIN kunder k ON k.id = a.company_id
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder_unikke(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(kategori text, antal integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
        _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  SELECT public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3), count(*)::int
  FROM public.companies c
  WHERE c.afdeling_nr = ANY (_afd)
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sales_monthly sm
      WHERE sm.company_id = c.id AND sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0
        AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
        AND sm.period >= (date_trunc('month', _fra) - interval '2 months')::date
        AND sm.period <= LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date))
  GROUP BY 1;
END $function$;