CREATE INDEX IF NOT EXISTS sales_monthly_products_location_period_idx
  ON public.sales_monthly_products (location_id, period);

CREATE INDEX IF NOT EXISTS sales_monthly_afdeling_period_idx
  ON public.sales_monthly (afdeling_nr, period);

CREATE OR REPLACE FUNCTION public.company_sales_summary(_company_ids uuid[])
RETURNS TABLE(company_id uuid, revenue_12m numeric, last_purchase date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    sm.company_id,
    COALESCE(SUM(CASE WHEN sm.period >= (date_trunc('month', now())::date - INTERVAL '12 months')::date THEN sm.revenue ELSE 0 END), 0) AS revenue_12m,
    MAX(CASE WHEN sm.revenue > 0 THEN COALESCE(sm.last_invoice_date, sm.period) END) AS last_purchase
  FROM public.sales_monthly sm
  WHERE sm.company_id = ANY(_company_ids)
  GROUP BY sm.company_id
$$;

GRANT EXECUTE ON FUNCTION public.company_sales_summary(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.location_sales_summary(_location_ids uuid[])
RETURNS TABLE(location_id uuid, revenue_12m numeric, last_period date, last_purchase date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    sm.location_id,
    COALESCE(SUM(CASE WHEN sm.period >= (date_trunc('month', now())::date - INTERVAL '12 months')::date THEN sm.revenue ELSE 0 END), 0) AS revenue_12m,
    MAX(CASE WHEN sm.revenue > 0 THEN sm.period END) AS last_period,
    MAX(CASE WHEN sm.revenue > 0 THEN COALESCE(sm.last_invoice_date, sm.period) END) AS last_purchase
  FROM public.sales_monthly sm
  WHERE sm.location_id = ANY(_location_ids)
  GROUP BY sm.location_id
$$;

GRANT EXECUTE ON FUNCTION public.location_sales_summary(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.monthly_revenue_totals(
  _periods date[],
  _afdeling_nr integer DEFAULT NULL,
  _company_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(period date, revenue numeric, companies_with_sales integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    sm.period,
    COALESCE(SUM(sm.revenue), 0) AS revenue,
    COUNT(DISTINCT sm.company_id)::int AS companies_with_sales
  FROM public.sales_monthly sm
  WHERE sm.period = ANY(_periods)
    AND (_afdeling_nr IS NULL OR sm.afdeling_nr = _afdeling_nr)
    AND (_company_ids IS NULL OR sm.company_id = ANY(_company_ids))
  GROUP BY sm.period
$$;

GRANT EXECUTE ON FUNCTION public.monthly_revenue_totals(date[], integer, uuid[]) TO authenticated, service_role;