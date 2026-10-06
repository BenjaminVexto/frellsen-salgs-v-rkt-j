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
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH s AS (
    SELECT f.period, f.rev, f.contrib, f.kg_c4
    FROM public.sales_kunde_maaned f
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
      AND (_saelger IS NULL OR f.saelger = _saelger)
      AND (_afdeling_nr IS NULL OR f.c_afd = _afdeling_nr)
      AND f.period >= _start_prior AND f.period <= _last_full
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
    coalesce(sum(s.kg_c4) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0),
    coalesce(sum(s.kg_c4) FILTER (WHERE s.period >= w.start_prior_ytd AND s.period <= w.end_prior_ytd), 0),
    coalesce(sum(s.kg_c4) FILTER (WHERE s.period = w.end_prior_ytd AND s.period >= w.start_prior_ytd), 0),
    to_char(w.ref, 'YYYY-MM-DD'),
    CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full), 0) ELSE NULL END
  FROM s CROSS JOIN w
  GROUP BY w.ref, w.start_cur_ytd, w.start_prior_ytd, w.end_prior_ytd;
END;
$function$;