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
      customer_type = public.kundestatus(fb.p, coalesce(la.p, cids.last_purchase_date), eqm.company_id IS NOT NULL)
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
      customer_type = public.kundestatus(fb.p, coalesce(la.p, cids.last_purchase_date), eqm.company_id IS NOT NULL)
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