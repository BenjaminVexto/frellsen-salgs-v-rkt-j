
ALTER TABLE public.sales_monthly
  ADD COLUMN IF NOT EXISTS last_invoice_date date;

CREATE OR REPLACE FUNCTION public.recompute_company_status(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last_all date;
  v_last_cons date;
  v_last_purchase date;
  v_effective date;
  v_has_eq boolean;
  v_type customer_type;
BEGIN
  SELECT MAX(COALESCE(last_invoice_date, period)) INTO v_last_all
  FROM public.sales_monthly
  WHERE company_id = _company_id
    AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0);

  SELECT MAX(COALESCE(last_invoice_date, period)) INTO v_last_cons
  FROM public.sales_monthly
  WHERE company_id = _company_id
    AND (COALESCE(revenue,0) > 0 OR COALESCE(quantity,0) > 0 OR COALESCE(order_count,0) > 0)
    AND public.is_consumable_group(product_group_1);

  SELECT last_purchase_date INTO v_last_purchase
  FROM public.companies WHERE id = _company_id;

  SELECT EXISTS(
    SELECT 1 FROM public.location_equipment_units u
    JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id = _company_id
  ) INTO v_has_eq;

  IF v_has_eq THEN
    v_type := 'aktiv_kunde'::customer_type;
  ELSIF v_last_all IS NULL AND v_last_purchase IS NULL THEN
    v_type := 'nyt_emne'::customer_type;
  ELSE
    v_effective := GREATEST(
      COALESCE(v_last_all, DATE '1900-01-01'),
      COALESCE(v_last_purchase, DATE '1900-01-01')
    );
    IF v_effective >= (CURRENT_DATE - INTERVAL '12 months') THEN
      v_type := 'aktiv_kunde'::customer_type;
    ELSIF v_effective >= (CURRENT_DATE - INTERVAL '24 months') THEN
      v_type := 'sovende_kunde'::customer_type;
    ELSE
      v_type := 'tidligere_kunde'::customer_type;
    END IF;
  END IF;

  UPDATE public.companies
  SET last_sales_date = v_last_all,
      last_consumable_sales_date = v_last_cons,
      has_active_equipment = v_has_eq,
      customer_type = v_type
  WHERE id = _company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_all_company_statuses()
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
  ), eq AS (
    SELECT DISTINCT l.company_id
    FROM public.location_equipment_units u
    JOIN public.locations l ON l.id = u.location_id
    WHERE l.company_id IS NOT NULL
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
  WHERE c.id = cids.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
