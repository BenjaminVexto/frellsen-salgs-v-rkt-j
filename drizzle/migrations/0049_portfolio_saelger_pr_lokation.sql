DROP FUNCTION IF EXISTS public.portfolio_aggregat(uuid, integer);
CREATE FUNCTION public.portfolio_aggregat(_saelger uuid DEFAULT NULL::uuid, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, city text, customer_type text, has_active_equipment boolean, last_consumable_sales_date date, last_sales_date date, employees integer, is_public boolean, sektor text, revenue12m numeric, revenue12m_prior numeric, revenue_ytd numeric, revenue_ytd_prior numeric, ytd_prior_last_month_rev numeric, contribution12m numeric, monthly numeric[], cons_perioder text[], vare_grupper text[], consumable_rev12m numeric, last_sales_now text, last_sales_prior text, last_cons_now text, last_cons_prior text, assigned_to uuid, saelger_navn text, lok_antal integer, lok_total integer, kreditspaerret boolean)
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
  _sref date := public.seneste_fakturadato();
BEGIN
  SELECT max(f.period) INTO _ref
  FROM public.sales_kunde_maaned f
  JOIN public.companies c ON c.id = f.company_id
  WHERE f.period >= _start_prior AND f.period <= _last_full
    AND c.afdeling_nr = ANY (_afd)
    AND c.afloest_af_company_id IS NULL
    AND (_saelger IS NULL OR f.saelger = _saelger) AND public.maalepunkt_adgang(_saelger)
    AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
    AND public.kundetype(c.customer_segment_3) <> 'intern';

  _ref := least(coalesce(_ref, _last_full), _last_full);
  _start_cur_ytd := make_date(extract(year FROM _ref)::int, 1, 1);
  _start_prior_ytd := make_date(extract(year FROM _ref)::int - 1, 1, 1);
  _end_prior_ytd := make_date(extract(year FROM _ref)::int - 1, extract(month FROM _ref)::int, 1);

  RETURN QUERY
  WITH valgte AS MATERIALIZED (
    SELECT c.id, c.name, c.city, c.customer_type::text AS customer_type,
           c.has_active_equipment, c.last_consumable_sales_date, c.last_sales_date,
           c.employees, public.kundetype(c.customer_segment_3) AS sektor,
           c.assigned_to AS assigned_to, pr.full_name AS saelger_navn,
           coalesce(c.kreditspaerret, false) AS kreditspaerret
    FROM public.companies c
    LEFT JOIN public.profiles pr ON pr.id = c.assigned_to
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger
           OR EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = c.id AND l.saelger_user_id = _saelger)
           OR EXISTS (SELECT 1 FROM public.sales_kunde_maaned f2 WHERE f2.company_id = c.id AND f2.saelger = _saelger))
      AND public.maalepunkt_adgang(_saelger)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND public.kundetype(c.customer_segment_3) <> 'intern'
  ), s AS MATERIALIZED (
    SELECT f.*
    FROM public.sales_kunde_maaned f
    JOIN valgte v ON v.id = f.company_id
    WHERE f.period >= _start_prior
      AND (_saelger IS NULL OR f.saelger = _saelger)
  ), st AS (
    SELECT f.company_id, max(f.last_inv_fb) AS fb, max(f.last_inv_any) AS la, max(f.last_inv_cons) AS lc
    FROM public.sales_kunde_maaned f JOIN valgte v ON v.id = f.company_id
    WHERE _saelger IS NOT NULL AND f.saelger = _saelger
    GROUP BY f.company_id
  ), lk AS (
    SELECT l.company_id, count(*) FILTER (WHERE l.i_aktoer)::int AS total,
           count(*) FILTER (WHERE l.i_aktoer AND l.saelger_user_id = _saelger)::int AS egne
    FROM public.locations l JOIN valgte v ON v.id = l.company_id
    GROUP BY l.company_id
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
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p1), 0),
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p2), 0),
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p3), 0),
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p4), 0),
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p5), 0),
        coalesce(sum(s.rev_ex16) FILTER (WHERE s.period = _p6), 0)
      ]::numeric[] AS monthly,
      coalesce(sum(s.rev_c4) FILTER (WHERE s.period >= _start_cur AND s.period <= _last_full), 0) AS consumable_rev12m,
      to_char(max(s.period) FILTER (WHERE s.pos_any), 'YYYY-MM-DD') AS last_sales_now,
      to_char(max(s.period) FILTER (WHERE s.pos_any AND s.period < _this_month), 'YYYY-MM-DD') AS last_sales_prior,
      to_char(max(s.period) FILTER (WHERE s.pos_fg), 'YYYY-MM-DD') AS last_cons_now,
      to_char(max(s.period) FILTER (WHERE s.pos_fg AND s.period < _this_month), 'YYYY-MM-DD') AS last_cons_prior
    FROM s
    GROUP BY s.company_id
  ), cp AS (
    SELECT d.company_id, array_agg(to_char(d.period, 'YYYY-MM-DD') ORDER BY d.period) AS cons_perioder
    FROM (SELECT DISTINCT s.company_id, s.period FROM s WHERE s.pos_c4) d
    GROUP BY d.company_id
  ), vg AS (
    SELECT d.company_id, array_agg(d.kode ORDER BY d.kode) AS vare_grupper
    FROM (SELECT DISTINCT s.company_id, unnest(s.koder) AS kode FROM s
          WHERE s.period >= _start_cur AND s.period <= _last_full) d
    GROUP BY d.company_id
  )
  SELECT
    v.id, v.name, v.city,
    CASE WHEN _saelger IS NULL THEN v.customer_type
         ELSE public.kundestatus_dage(st.fb, st.la, v.has_active_equipment, true, _sref)::text END,
    v.has_active_equipment,
    CASE WHEN _saelger IS NULL THEN v.last_consumable_sales_date ELSE st.lc END,
    CASE WHEN _saelger IS NULL THEN v.last_sales_date ELSE st.la END,
    v.employees,
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
    v.assigned_to, v.saelger_navn,
    CASE WHEN _saelger IS NULL THEN coalesce(lk.total, 0) ELSE coalesce(lk.egne, 0) END,
    coalesce(lk.total, 0), v.kreditspaerret
  FROM valgte v
  LEFT JOIN st ON st.company_id = v.id
  LEFT JOIN lk ON lk.company_id = v.id
  LEFT JOIN a ON a.company_id = v.id
  LEFT JOIN cp ON cp.company_id = v.id
  LEFT JOIN vg ON vg.company_id = v.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.portfolio_aggregat(uuid, integer) TO authenticated;