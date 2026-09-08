CREATE OR REPLACE FUNCTION public.portfolio_aggregat(_saelger uuid DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  name text,
  city text,
  customer_type text,
  has_active_equipment boolean,
  last_consumable_sales_date date,
  last_sales_date date,
  employees integer,
  is_public boolean,
  revenue12m numeric,
  revenue12m_prior numeric,
  revenue_ytd numeric,
  revenue_ytd_prior numeric,
  ytd_prior_last_month_rev numeric,
  contribution12m numeric,
  monthly numeric[],
  cons_perioder text[],
  vare_grupper text[],
  consumable_rev12m numeric,
  last_sales_now text,
  last_sales_prior text,
  last_cons_now text,
  last_cons_prior text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _maa_db boolean := public.maa_se_db(auth.uid());
  _this_month date := date_trunc('month', now())::date;
  _start_cur date := (date_trunc('month', now()) - interval '11 months')::date;
  _start_prior date := (date_trunc('month', now()) - interval '23 months')::date;
  _end_prior_excl date := (date_trunc('month', now()) - interval '11 months')::date;
  _p1 date := (date_trunc('month', now()) - interval '6 months')::date;
  _p2 date := (date_trunc('month', now()) - interval '5 months')::date;
  _p3 date := (date_trunc('month', now()) - interval '4 months')::date;
  _p4 date := (date_trunc('month', now()) - interval '3 months')::date;
  _p5 date := (date_trunc('month', now()) - interval '2 months')::date;
  _p6 date := (date_trunc('month', now()) - interval '1 month')::date;
  _ref date;
  _start_cur_ytd date;
  _start_prior_ytd date;
  _end_prior_ytd date;
BEGIN
  -- Referencemåned = seneste periode i datasættet (samme regel som hidtil i browseren).
  SELECT max(sm.period) INTO _ref
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.period >= _start_prior
    AND c.afloest_af_company_id IS NULL
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND (_saelger IS NOT NULL OR c.assigned_to IS NOT NULL)
    AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
    AND coalesce(c.customer_segment_3, '') !~ '^\s*5\s*\[';

  _ref := coalesce(_ref, _this_month);
  _start_cur_ytd := make_date(extract(year FROM _ref)::int, 1, 1);
  _start_prior_ytd := make_date(extract(year FROM _ref)::int - 1, 1, 1);
  _end_prior_ytd := make_date(extract(year FROM _ref)::int - 1, extract(month FROM _ref)::int, 1);

  RETURN QUERY
  WITH valgte AS (
    SELECT c.id, c.name, c.city, c.customer_type::text AS customer_type,
           c.has_active_equipment, c.last_consumable_sales_date, c.last_sales_date,
           c.employees, c.is_public
    FROM public.companies c
    WHERE c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND (_saelger IS NOT NULL OR c.assigned_to IS NOT NULL)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND coalesce(c.customer_segment_3, '') !~ '^\s*5\s*\['
  ), s AS (
    SELECT sm.company_id,
           sm.period,
           coalesce(sm.revenue, 0)::numeric AS rev,
           coalesce(sm.contribution, 0)::numeric AS contrib,
           substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode
    FROM public.sales_monthly sm
    JOIN valgte v ON v.id = sm.company_id
    WHERE sm.period >= _start_prior
  ), a AS (
    SELECT
      s.company_id,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur AND s.period <= _this_month), 0) AS revenue12m,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior AND s.period < _end_prior_excl), 0) AS revenue12m_prior,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur_ytd AND s.period <= _ref), 0) AS revenue_ytd,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior_ytd AND s.period <= _end_prior_ytd), 0) AS revenue_ytd_prior,
      coalesce(sum(s.rev) FILTER (WHERE s.period = _end_prior_ytd AND s.period >= _start_prior_ytd), 0) AS ytd_prior_last_month_rev,
      CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= _start_cur AND s.period <= _this_month), 0) ELSE NULL END AS contribution12m,
      ARRAY[
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p1 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p2 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p3 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p4 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p5 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p6 AND s.kode IS DISTINCT FROM '16'), 0)
      ]::numeric[] AS monthly,
      coalesce(array_agg(DISTINCT to_char(s.period, 'YYYY-MM-DD')) FILTER (
        WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10')
      ), '{}'::text[]) AS cons_perioder,
      coalesce(array_agg(DISTINCT s.kode) FILTER (
        WHERE s.kode IS NOT NULL AND s.period >= _start_cur AND s.period <= _this_month
      ), '{}'::text[]) AS vare_grupper,
      coalesce(sum(s.rev) FILTER (
        WHERE s.period >= _start_cur AND s.period <= _this_month AND s.kode IN ('2', '4', '6', '10')
      ), 0) AS consumable_rev12m,
      to_char(max(s.period) FILTER (WHERE s.rev > 0), 'YYYY-MM-DD') AS last_sales_now,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.period < _this_month), 'YYYY-MM-DD') AS last_sales_prior,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10')), 'YYYY-MM-DD') AS last_cons_now,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10') AND s.period < _this_month), 'YYYY-MM-DD') AS last_cons_prior
    FROM s
    GROUP BY s.company_id
  )
  SELECT
    v.id, v.name, v.city, v.customer_type, v.has_active_equipment,
    v.last_consumable_sales_date, v.last_sales_date, v.employees, v.is_public,
    coalesce(a.revenue12m, 0),
    coalesce(a.revenue12m_prior, 0),
    coalesce(a.revenue_ytd, 0),
    coalesce(a.revenue_ytd_prior, 0),
    coalesce(a.ytd_prior_last_month_rev, 0),
    CASE WHEN _maa_db THEN coalesce(a.contribution12m, 0) ELSE NULL END,
    coalesce(a.monthly, ARRAY[0, 0, 0, 0, 0, 0]::numeric[]),
    coalesce(a.cons_perioder, '{}'::text[]),
    coalesce(a.vare_grupper, '{}'::text[]),
    coalesce(a.consumable_rev12m, 0),
    a.last_sales_now, a.last_sales_prior, a.last_cons_now, a.last_cons_prior
  FROM valgte v
  LEFT JOIN a ON a.company_id = v.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portfolio_totaler(_saelger uuid DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(
  revenue12m numeric,
  revenue12m_prior_year numeric,
  revenue_ytd numeric,
  revenue_ytd_prior numeric,
  ytd_prior_last_month_rev numeric,
  weight_kg_ytd numeric,
  weight_kg_ytd_prior numeric,
  ytd_prior_last_month_weight_kg numeric,
  latest_period text,
  contribution12m numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _maa_db boolean := public.maa_se_db(auth.uid());
  _this_month date := date_trunc('month', now())::date;
  _start_cur date := (date_trunc('month', now()) - interval '11 months')::date;
  _start_prior date := (date_trunc('month', now()) - interval '23 months')::date;
  _end_prior_excl date := (date_trunc('month', now()) - interval '11 months')::date;
  _ref date;
  _start_cur_ytd date;
  _start_prior_ytd date;
  _end_prior_ytd date;
BEGIN
  RETURN QUERY
  WITH valgte AS (
    SELECT c.id
    FROM public.companies c
    WHERE c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND (_saelger IS NOT NULL OR c.assigned_to IS NOT NULL)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND coalesce(c.customer_segment_3, '') !~ '^\s*5\s*\['
  ), s AS (
    SELECT sm.period,
           coalesce(sm.revenue, 0)::numeric AS rev,
           coalesce(sm.contribution, 0)::numeric AS contrib,
           coalesce(sm.weight_kg, 0)::numeric AS kg,
           substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode
    FROM public.sales_monthly sm
    JOIN valgte v ON v.id = sm.company_id
    WHERE sm.period >= _start_prior
  ), r AS (
    SELECT coalesce(max(s.period), _this_month) AS ref FROM s
  ), w AS (
    SELECT r.ref,
           make_date(extract(year FROM r.ref)::int, 1, 1) AS start_cur_ytd,
           make_date(extract(year FROM r.ref)::int - 1, 1, 1) AS start_prior_ytd,
           make_date(extract(year FROM r.ref)::int - 1, extract(month FROM r.ref)::int, 1) AS end_prior_ytd
    FROM r
  )
  SELECT
    coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur AND s.period <= _this_month), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior AND s.period < _end_prior_excl), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= w.start_prior_ytd AND s.period <= w.end_prior_ytd), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period = w.end_prior_ytd AND s.period >= w.start_prior_ytd), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref AND s.kode IN ('2', '4', '6', '10')), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period >= w.start_prior_ytd AND s.period <= w.end_prior_ytd AND s.kode IN ('2', '4', '6', '10')), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period = w.end_prior_ytd AND s.period >= w.start_prior_ytd AND s.kode IN ('2', '4', '6', '10')), 0),
    to_char(max(s.period), 'YYYY-MM-DD'),
    CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= _start_cur AND s.period <= _this_month), 0) ELSE NULL END
  FROM s CROSS JOIN w
  GROUP BY w.ref, w.start_cur_ytd, w.start_prior_ytd, w.end_prior_ytd;
END;
$function$;

REVOKE ALL ON FUNCTION public.portfolio_aggregat(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portfolio_totaler(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_aggregat(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portfolio_totaler(uuid, integer) TO authenticated, service_role;