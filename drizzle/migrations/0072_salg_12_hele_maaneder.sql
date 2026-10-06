CREATE OR REPLACE FUNCTION public.location_sales_summary(_location_ids uuid[])
 RETURNS TABLE(location_id uuid, revenue_12m numeric, last_period date, last_purchase date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  -- Omsætning 12 mdr. = de seneste 12 hele måneder (indeværende måned undtaget), samme som kundekortets Oversigt/Salg.
  SELECT
    sm.location_id,
    COALESCE(SUM(CASE WHEN sm.period >= (date_trunc('month', now())::date - INTERVAL '12 months')::date
                       AND sm.period < date_trunc('month', now())::date THEN sm.revenue ELSE 0 END), 0) AS revenue_12m,
    MAX(CASE WHEN sm.revenue > 0 THEN sm.period END) AS last_period,
    MAX(CASE WHEN sm.revenue > 0 THEN COALESCE(sm.last_invoice_date, sm.period) END) AS last_purchase
  FROM public.sales_monthly sm
  WHERE sm.location_id = ANY(_location_ids)
  GROUP BY sm.location_id
$function$;

CREATE OR REPLACE FUNCTION public.company_sales_summary(_company_ids uuid[])
 RETURNS TABLE(company_id uuid, revenue_12m numeric, last_purchase date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT
    sm.company_id,
    COALESCE(SUM(CASE WHEN sm.period >= (date_trunc('month', now())::date - INTERVAL '12 months')::date
                       AND sm.period < date_trunc('month', now())::date THEN sm.revenue ELSE 0 END), 0) AS revenue_12m,
    MAX(CASE WHEN sm.revenue > 0 THEN COALESCE(sm.last_invoice_date, sm.period) END) AS last_purchase
  FROM public.sales_monthly sm
  WHERE sm.company_id = ANY(_company_ids)
  GROUP BY sm.company_id
$function$;