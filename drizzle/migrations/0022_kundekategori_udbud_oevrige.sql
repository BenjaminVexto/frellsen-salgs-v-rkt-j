CREATE OR REPLACE FUNCTION public.portfolio_aggregat(_saelger uuid DEFAULT NULL::uuid, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, city text, customer_type text, has_active_equipment boolean, last_consumable_sales_date date, last_sales_date date, employees integer, is_public boolean, sektor text, revenue12m numeric, revenue12m_prior numeric, revenue_ytd numeric, revenue_ytd_prior numeric, ytd_prior_last_month_rev numeric, contribution12m numeric, monthly numeric[], cons_perioder text[], vare_grupper text[], consumable_rev12m numeric, last_sales_now text, last_sales_prior text, last_cons_now text, last_cons_prior text, assigned_to uuid, saelger_navn text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _maa_db boolean := public.maa_se_db(auth.uid());
  _afd int[] := (SELECT public.my_afdelinger())::int[];
  _this_month date := date_trunc('month', now())::date;
  _last_full date := (date_trunc('month', now()) - interval '1 month')::date;
  _start_cur date := (date_trunc('month', now()) - interval '12 months')::date;
  _start_prior date := (date_trunc('month', now()) - interval '24 months')::date;
  _end_prior_excl date := (date_trunc('month', now()) - interval '12 months')::date;
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
  SELECT max(sm.period) INTO _ref
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.period >= _start_prior
    AND sm.period <= _last_full
    AND c.afdeling_nr = ANY (_afd)
    AND c.afloest_af_company_id IS NULL
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
    AND coalesce(c.customer_segment_3, '') !~ '^\s*5\s*\[';

  _ref := least(coalesce(_ref, _last_full), _last_full);
  _start_cur_ytd := make_date(extract(year FROM _ref)::int, 1, 1);
  _start_prior_ytd := make_date(extract(year FROM _ref)::int - 1, 1, 1);
  _end_prior_ytd := make_date(extract(year FROM _ref)::int - 1, extract(month FROM _ref)::int, 1);

  RETURN QUERY
  WITH valgte AS MATERIALIZED (
    SELECT c.id, c.name, c.city, c.customer_type::text AS customer_type,
           c.has_active_equipment, c.last_consumable_sales_date, c.last_sales_date,
           c.employees,
           public.kundetype(c.customer_segment_3) AS sektor,
           c.assigned_to AS assigned_to,
           pr.full_name AS saelger_navn
    FROM public.companies c
    LEFT JOIN public.profiles pr ON pr.id = c.assigned_to
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND coalesce(c.customer_segment_3, '') !~ '^\s*5\s*\['
  ), s AS MATERIALIZED (
    SELECT sm.company_id, sm.period,
           coalesce(sm.revenue, 0)::numeric AS rev,
           coalesce(sm.contribution, 0)::numeric AS contrib,
           substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode
    FROM public.sales_monthly sm
    JOIN valgte v ON v.id = sm.company_id
    WHERE sm.period >= _start_prior
  ), a AS (
    SELECT
      s.company_id,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full), 0) AS revenue12m,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior AND s.period < _end_prior_excl), 0) AS revenue12m_prior,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur_ytd AND s.period <= _ref), 0) AS revenue_ytd,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior_ytd AND s.period <= _end_prior_ytd), 0) AS revenue_ytd_prior,
      coalesce(sum(s.rev) FILTER (WHERE s.period = _end_prior_ytd AND s.period >= _start_prior_ytd), 0) AS ytd_prior_last_month_rev,
      CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full), 0) ELSE NULL END AS contribution12m,
      ARRAY[
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p1 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p2 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p3 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p4 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p5 AND s.kode IS DISTINCT FROM '16'), 0),
        coalesce(sum(s.rev) FILTER (WHERE s.period = _p6 AND s.kode IS DISTINCT FROM '16'), 0)
      ]::numeric[] AS monthly,
      coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full AND s.kode IN ('2', '4', '6', '10')), 0) AS consumable_rev12m,
      to_char(max(s.period) FILTER (WHERE s.rev > 0), 'YYYY-MM-DD') AS last_sales_now,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.period < _this_month), 'YYYY-MM-DD') AS last_sales_prior,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10')), 'YYYY-MM-DD') AS last_cons_now,
      to_char(max(s.period) FILTER (WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10') AND s.period < _this_month), 'YYYY-MM-DD') AS last_cons_prior
    FROM s
    GROUP BY s.company_id
  ), cp AS (
    SELECT d.company_id, array_agg(to_char(d.period, 'YYYY-MM-DD') ORDER BY d.period) AS cons_perioder
    FROM (SELECT DISTINCT s.company_id, s.period FROM s WHERE s.rev > 0 AND s.kode IN ('2', '4', '6', '10')) d
    GROUP BY d.company_id
  ), vg AS (
    SELECT d.company_id, array_agg(d.kode ORDER BY d.kode) AS vare_grupper
    FROM (SELECT DISTINCT s.company_id, s.kode FROM s WHERE s.kode IS NOT NULL AND s.period >= _start_cur AND s.period <= _last_full) d
    GROUP BY d.company_id
  )
  SELECT
    v.id, v.name, v.city, v.customer_type, v.has_active_equipment,
    v.last_consumable_sales_date, v.last_sales_date, v.employees,
    (v.sektor = 'offentlig'), v.sektor,
    coalesce(a.revenue12m, 0), coalesce(a.revenue12m_prior, 0),
    coalesce(a.revenue_ytd, 0), coalesce(a.revenue_ytd_prior, 0),
    coalesce(a.ytd_prior_last_month_rev, 0),
    CASE WHEN _maa_db THEN coalesce(a.contribution12m, 0) ELSE NULL END,
    coalesce(a.monthly, ARRAY[0, 0, 0, 0, 0, 0]::numeric[]),
    coalesce(cp.cons_perioder, '{}'::text[]),
    coalesce(vg.vare_grupper, '{}'::text[]),
    coalesce(a.consumable_rev12m, 0),
    a.last_sales_now, a.last_sales_prior, a.last_cons_now, a.last_cons_prior,
    v.assigned_to, v.saelger_navn
  FROM valgte v
  LEFT JOIN a ON a.company_id = v.id
  LEFT JOIN cp ON cp.company_id = v.id
  LEFT JOIN vg ON vg.company_id = v.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portfolio_totaler(_saelger uuid DEFAULT NULL::uuid, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(revenue12m numeric, revenue12m_prior_year numeric, revenue_ytd numeric, revenue_ytd_prior numeric, ytd_prior_last_month_rev numeric, weight_kg_ytd numeric, weight_kg_ytd_prior numeric, ytd_prior_last_month_weight_kg numeric, latest_period text, contribution12m numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _maa_db boolean := public.maa_se_db(auth.uid());
  _afd int[] := (SELECT public.my_afdelinger())::int[];
  _last_full date := (date_trunc('month', now()) - interval '1 month')::date;
  _start_cur date := (date_trunc('month', now()) - interval '12 months')::date;
  _start_prior date := (date_trunc('month', now()) - interval '24 months')::date;
  _end_prior_excl date := (date_trunc('month', now()) - interval '12 months')::date;
BEGIN
  RETURN QUERY
  WITH valgte AS (
    SELECT c.id
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
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
      AND sm.period <= _last_full
  ), r AS (
    SELECT least(coalesce(max(s.period), _last_full), _last_full) AS ref FROM s
  ), w AS (
    SELECT r.ref,
           make_date(extract(year FROM r.ref)::int, 1, 1) AS start_cur_ytd,
           make_date(extract(year FROM r.ref)::int - 1, 1, 1) AS start_prior_ytd,
           make_date(extract(year FROM r.ref)::int - 1, extract(month FROM r.ref)::int, 1) AS end_prior_ytd
    FROM r
  )
  SELECT
    coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= _start_prior AND s.period < _end_prior_excl), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period >= w.start_prior_ytd AND s.period <= w.end_prior_ytd), 0),
    coalesce(sum(s.rev) FILTER (WHERE s.period = w.end_prior_ytd AND s.period >= w.start_prior_ytd), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref AND s.kode IN ('2', '4', '6', '10')), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period >= w.start_prior_ytd AND s.period <= w.end_prior_ytd AND s.kode IN ('2', '4', '6', '10')), 0),
    coalesce(sum(s.kg) FILTER (WHERE s.period = w.end_prior_ytd AND s.period >= w.start_prior_ytd AND s.kode IN ('2', '4', '6', '10')), 0),
    to_char(w.ref, 'YYYY-MM-DD'),
    CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0) ELSE NULL END
  FROM s CROSS JOIN w
  GROUP BY w.ref, w.start_cur_ytd, w.start_prior_ytd, w.end_prior_ytd;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portfolio_db_ytd(_saelger uuid DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(contribution_ytd numeric, revenue_ytd numeric, fra text, til text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  _afd int[] := (SELECT public.my_afdelinger())::int[];
  _last_full date := (date_trunc('month', now()) - interval '1 month')::date;
BEGIN
  IF NOT public.maa_se_db(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT sm.period, coalesce(sm.revenue,0)::numeric rev, coalesce(sm.contribution,0)::numeric contrib
    FROM public.sales_monthly sm JOIN public.companies c ON c.id = sm.company_id
    WHERE c.afdeling_nr = ANY (_afd) AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND coalesce(c.customer_segment_3,'') !~ '^\s*5\s*\['
      AND sm.period >= (date_trunc('month', now()) - interval '24 months')::date AND sm.period <= _last_full
  ), r AS (SELECT least(coalesce(max(period), _last_full), _last_full) ref FROM s),
  w AS (SELECT ref, make_date(extract(year FROM ref)::int,1,1) st FROM r)
  SELECT coalesce(sum(s.contrib) FILTER (WHERE s.period BETWEEN w.st AND w.ref),0),
         coalesce(sum(s.rev) FILTER (WHERE s.period BETWEEN w.st AND w.ref),0),
         to_char(w.st,'YYYY-MM-DD'), to_char(w.ref,'YYYY-MM-DD')
  FROM w LEFT JOIN s ON true GROUP BY w.st, w.ref;
END $f$;
GRANT EXECUTE ON FUNCTION public.portfolio_db_ytd(uuid,integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.kunde_sektor(text,text,text,boolean,institution_type,text) IS 'DEPRECATED: brug public.kundetype(customer_segment_3)';

CREATE OR REPLACE FUNCTION public.sektorfordeling(_fra date, _til date, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(segment text, antal_kunder bigint, omsaetning numeric, db numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT coalesce(nullif(substring(btrim(coalesce(c.customer_segment_3,'')) FROM '^(\d+)\s*\['),''),'uden') AS segment,
         count(DISTINCT c.id) FILTER (WHERE sm.revenue <> 0),
         coalesce(sum(sm.revenue),0)::numeric,
         CASE WHEN public.maa_se_db(auth.uid()) THEN coalesce(sum(sm.contribution),0)::numeric END
  FROM public.sales_monthly sm JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.period BETWEEN _fra AND _til
    AND c.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
    AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
    AND c.afloest_af_company_id IS NULL
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'salgssupport') OR coalesce((SELECT maa_se_analyse FROM public.profiles WHERE id = auth.uid()), false))
  GROUP BY 1
$f$;
GRANT EXECUTE ON FUNCTION public.sektorfordeling(date,date,integer) TO authenticated, service_role;