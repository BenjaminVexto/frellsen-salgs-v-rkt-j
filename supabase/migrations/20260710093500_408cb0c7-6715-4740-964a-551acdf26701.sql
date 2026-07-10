CREATE OR REPLACE FUNCTION public.recompute_company_statuses_batch(_company_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  WITH last_all AS (
    SELECT company_id, MAX(COALESCE(last_invoice_date, period)) AS d
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
  ), eq AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u
    JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id = ANY(_company_ids)
  )
  UPDATE public.companies c
  SET last_sales_date = la.d,
      last_consumable_sales_date = lc.d,
      has_active_equipment = (eq.company_id IS NOT NULL),
      customer_type = CASE
        WHEN eq.company_id IS NOT NULL THEN 'aktiv_kunde'::customer_type
        WHEN la.d IS NULL AND cids.last_purchase_date IS NULL THEN 'nyt_emne'::customer_type
        WHEN GREATEST(
               COALESCE(la.d, DATE '1900-01-01'),
               COALESCE(cids.last_purchase_date, DATE '1900-01-01')
             ) >= (CURRENT_DATE - INTERVAL '12 months') THEN 'aktiv_kunde'::customer_type
        WHEN GREATEST(
               COALESCE(la.d, DATE '1900-01-01'),
               COALESCE(cids.last_purchase_date, DATE '1900-01-01')
             ) >= (CURRENT_DATE - INTERVAL '24 months') THEN 'sovende_kunde'::customer_type
        ELSE 'tidligere_kunde'::customer_type
      END
  FROM public.companies cids
  LEFT JOIN last_all la ON la.company_id = cids.id
  LEFT JOIN last_cons lc ON lc.company_id = cids.id
  LEFT JOIN eq ON eq.company_id = cids.id
  WHERE c.id = cids.id AND cids.id = ANY(_company_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recompute_company_statuses_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_company_statuses_batch(uuid[]) TO service_role;