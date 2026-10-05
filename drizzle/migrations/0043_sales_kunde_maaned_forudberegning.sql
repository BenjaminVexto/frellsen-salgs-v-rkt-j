-- Forudberegnet salg pr. (kunde, afdeling, måned), bygget 1:1 ud fra sales_monthly.
-- Sælger og kundekategori læses stadig live fra companies, så en ny
-- sælgertildeling eller en Aktør-import slår igennem med det samme uden
-- genberegning. Tabellen holdes ajour af triggere på sales_monthly, så den
-- altid kun genberegner de (kunde, afdeling, måned), der faktisk ændres.
CREATE TABLE public.sales_kunde_maaned (
  company_id uuid NOT NULL,
  afdeling_nr integer NOT NULL,
  period date NOT NULL,
  rev numeric NOT NULL DEFAULT 0,
  contrib numeric NOT NULL DEFAULT 0,
  kg numeric NOT NULL DEFAULT 0,
  rev_fg numeric NOT NULL DEFAULT 0,
  contrib_fg numeric NOT NULL DEFAULT 0,
  pos_fg boolean NOT NULL DEFAULT false,
  pos_any boolean NOT NULL DEFAULT false,
  rev_ex16 numeric NOT NULL DEFAULT 0,
  rev_c4 numeric NOT NULL DEFAULT 0,
  kg_c4 numeric NOT NULL DEFAULT 0,
  pos_c4 boolean NOT NULL DEFAULT false,
  koder text[] NOT NULL DEFAULT '{}',
  has_fg boolean NOT NULL DEFAULT false,
  PRIMARY KEY (afdeling_nr, period, company_id)
);
GRANT SELECT ON public.sales_kunde_maaned TO authenticated;
GRANT ALL ON public.sales_kunde_maaned TO service_role;
ALTER TABLE public.sales_kunde_maaned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin kan læse forudberegnet salg" ON public.sales_kunde_maaned
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_skm_company_period ON public.sales_kunde_maaned (company_id, period);
COMMENT ON TABLE public.sales_kunde_maaned IS
  'Forudberegnet fra sales_monthly pr. (kunde, afdeling, måned). Holdes ajour af triggere på sales_monthly. Læses af målepunkter og portefølje. rev_fg/contrib_fg/has_fg: product_group_1 er præcis en forbrugsgruppe. pos_fg: revenue>0 i forbrugsgruppe (ledende kode). pos_any: revenue>0. rev_ex16: uden gruppe 16. *_c4: grupper 2,4,6,10.';

CREATE OR REPLACE FUNCTION public._skm_refresh_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  DELETE FROM public.sales_kunde_maaned f
  USING (SELECT DISTINCT company_id, afdeling_nr, period FROM pg_temp._skm_keys) k
  WHERE f.company_id = k.company_id AND f.afdeling_nr = k.afdeling_nr AND f.period = k.period;

  INSERT INTO public.sales_kunde_maaned
  SELECT x.company_id, x.afdeling_nr, x.period,
         sum(x.rev), sum(x.contrib), sum(x.kg),
         coalesce(sum(x.rev) FILTER (WHERE x.pg1 = ANY (_fg)), 0),
         coalesce(sum(x.contrib) FILTER (WHERE x.pg1 = ANY (_fg)), 0),
         coalesce(bool_or(x.rev_raw > 0 AND x.kode = ANY (_fg)), false),
         coalesce(bool_or(x.rev_raw > 0), false),
         coalesce(sum(x.rev) FILTER (WHERE x.kode IS DISTINCT FROM '16'), 0),
         coalesce(sum(x.rev) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
         coalesce(sum(x.kg) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
         coalesce(bool_or(x.rev_raw > 0 AND x.kode IN ('2','4','6','10')), false),
         coalesce(array_agg(DISTINCT x.kode) FILTER (WHERE x.kode IS NOT NULL), '{}'),
         coalesce(bool_or(x.pg1 = ANY (_fg)), false)
  FROM (
    SELECT sm.company_id, sm.afdeling_nr, sm.period, sm.product_group_1 AS pg1,
           sm.revenue AS rev_raw,
           coalesce(sm.revenue, 0)::numeric AS rev,
           coalesce(sm.contribution, 0)::numeric AS contrib,
           coalesce(sm.weight_kg, 0)::numeric AS kg,
           substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode
    FROM public.sales_monthly sm
    JOIN (SELECT DISTINCT company_id, afdeling_nr, period FROM pg_temp._skm_keys) k
      ON k.company_id = sm.company_id AND k.afdeling_nr = sm.afdeling_nr AND k.period = sm.period
  ) x
  GROUP BY 1, 2, 3;

  DELETE FROM pg_temp._skm_keys;
END;
$$;

CREATE OR REPLACE FUNCTION public._skm_trg_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT company_id, afdeling_nr, period FROM new_rows
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL;
  PERFORM public._skm_refresh_keys();
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._skm_trg_old()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT company_id, afdeling_nr, period FROM old_rows
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL;
  PERFORM public._skm_refresh_keys();
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._skm_trg_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  INSERT INTO pg_temp._skm_keys
    SELECT company_id, afdeling_nr, period FROM old_rows
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL
    UNION
    SELECT company_id, afdeling_nr, period FROM new_rows
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL;
  PERFORM public._skm_refresh_keys();
  RETURN NULL;
END $$;

CREATE TRIGGER trg_skm_ins AFTER INSERT ON public.sales_monthly
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._skm_trg_new();
CREATE TRIGGER trg_skm_del AFTER DELETE ON public.sales_monthly
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public._skm_trg_old();
CREATE TRIGGER trg_skm_upd AFTER UPDATE ON public.sales_monthly
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._skm_trg_upd();

REVOKE EXECUTE ON FUNCTION public._skm_refresh_keys() FROM PUBLIC, anon, authenticated;

INSERT INTO public.sales_kunde_maaned
SELECT x.company_id, x.afdeling_nr, x.period,
       sum(x.rev), sum(x.contrib), sum(x.kg),
       coalesce(sum(x.rev) FILTER (WHERE x.pg1 = ANY (public.maalepunkt_forbrug_grupper())), 0),
       coalesce(sum(x.contrib) FILTER (WHERE x.pg1 = ANY (public.maalepunkt_forbrug_grupper())), 0),
       coalesce(bool_or(x.rev_raw > 0 AND x.kode = ANY (public.maalepunkt_forbrug_grupper())), false),
       coalesce(bool_or(x.rev_raw > 0), false),
       coalesce(sum(x.rev) FILTER (WHERE x.kode IS DISTINCT FROM '16'), 0),
       coalesce(sum(x.rev) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
       coalesce(sum(x.kg) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
       coalesce(bool_or(x.rev_raw > 0 AND x.kode IN ('2','4','6','10')), false),
       coalesce(array_agg(DISTINCT x.kode) FILTER (WHERE x.kode IS NOT NULL), '{}'),
       coalesce(bool_or(x.pg1 = ANY (public.maalepunkt_forbrug_grupper())), false)
FROM (
  SELECT sm.company_id, sm.afdeling_nr, sm.period, sm.product_group_1 AS pg1,
         sm.revenue AS rev_raw,
         coalesce(sm.revenue, 0)::numeric AS rev,
         coalesce(sm.contribution, 0)::numeric AS contrib,
         coalesce(sm.weight_kg, 0)::numeric AS kg,
         substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode
  FROM public.sales_monthly sm
  WHERE sm.company_id IS NOT NULL AND sm.afdeling_nr IS NOT NULL AND sm.period IS NOT NULL
) x
GROUP BY 1, 2, 3;
ANALYZE public.sales_kunde_maaned;

CREATE OR REPLACE FUNCTION public.maalepunkt_omsaetning(_saelger uuid, _fra date, _til date, _kun_forbrug boolean, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
  _forbrug boolean := coalesce(_kun_forbrug, true);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kunder AS MATERIALIZED (
    SELECT c.id, public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kat
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd) AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
  )
  SELECT f.period, k.kat, round(sum(CASE WHEN _forbrug THEN f.rev_fg ELSE f.rev END), 2)
  FROM public.sales_kunde_maaned f
  JOIN kunder k ON k.id = f.company_id
  WHERE k.kat IS NOT NULL
    AND f.afdeling_nr = ANY (_afd)
    AND f.period >= date_trunc('month', _fra)::date
    AND f.period <= date_trunc('month', _til)::date
    AND f.period < date_trunc('month', current_date)::date
    AND (NOT _forbrug OR f.has_fg)
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_db(_saelger uuid, _fra date, _til date, _kun_forbrug boolean, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
  _forbrug boolean := coalesce(_kun_forbrug, true);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kunder AS MATERIALIZED (
    SELECT c.id, public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kat
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd) AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
  )
  SELECT f.period, k.kat, round(sum(CASE WHEN _forbrug THEN f.contrib_fg ELSE f.contrib END), 2)
  FROM public.sales_kunde_maaned f
  JOIN kunder k ON k.id = f.company_id
  WHERE k.kat IS NOT NULL
    AND f.afdeling_nr = ANY (_afd)
    AND f.period >= date_trunc('month', _fra)::date
    AND f.period <= date_trunc('month', _til)::date
    AND f.period < date_trunc('month', current_date)::date
    AND (NOT _forbrug OR f.has_fg)
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
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
  ), kunder AS MATERIALIZED (
    SELECT c.id, public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), oms AS (
    SELECT DISTINCT f.company_id, f.period
    FROM public.sales_kunde_maaned f JOIN kunder k ON k.id = f.company_id
    WHERE f.afdeling_nr = ANY (_afd) AND f.pos_fg
      AND f.period >= (date_trunc('month', _fra) - interval '2 months')::date
      AND f.period < date_trunc('month', current_date)::date
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
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH aktive AS (
    SELECT DISTINCT f.company_id
    FROM public.sales_kunde_maaned f
    WHERE f.afdeling_nr = ANY (_afd) AND f.pos_fg
      AND f.period >= (date_trunc('month', _fra) - interval '2 months')::date
      AND f.period <= LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date)
  )
  SELECT public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3), count(*)::int
  FROM public.companies c
  JOIN aktive a ON a.company_id = c.id
  WHERE c.afdeling_nr = ANY (_afd)
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1;
END $function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer, db numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kand AS MATERIALIZED (
    SELECT c.id, c.created_in_visma,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), '') AS gkey
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND c.created_in_visma IS NOT NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), agg AS (
    SELECT f.company_id,
           min(f.period) FILTER (WHERE f.pos_any) AS foerste_ordre,
           coalesce(sum(f.contrib) FILTER (
             WHERE f.period >= date_trunc('month', _fra)::date
               AND f.period <= date_trunc('month', _til)::date
               AND f.period < date_trunc('month', current_date)::date), 0) AS db_periode
    FROM public.sales_kunde_maaned f
    JOIN kand k ON k.id = f.company_id
    WHERE f.afdeling_nr = ANY (_afd)
    GROUP BY f.company_id
  ), acc AS (
    SELECT k.id, k.created_in_visma, k.kategori, k.gkey,
           a.foerste_ordre, coalesce(a.db_periode, 0) AS db_periode
    FROM kand k LEFT JOIN agg a ON a.company_id = k.id
  ), grp AS (
    SELECT a.gkey,
           min(a.foerste_ordre) AS foerste_ordre,
           sum(a.db_periode) AS db_periode,
           (array_agg(a.kategori ORDER BY a.created_in_visma, a.id))[1] AS kategori
    FROM acc a
    GROUP BY a.gkey
  )
  SELECT date_trunc('month', g.foerste_ordre)::date, g.kategori, count(*)::int, round(sum(g.db_periode), 2)
  FROM grp g
  WHERE g.foerste_ordre IS NOT NULL
    AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portfolio_totaler(_saelger uuid DEFAULT NULL::uuid, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(revenue12m numeric, revenue12m_prior_year numeric, revenue_ytd numeric, revenue_ytd_prior numeric, ytd_prior_last_month_rev numeric, weight_kg_ytd numeric, weight_kg_ytd_prior numeric, ytd_prior_last_month_weight_kg numeric, latest_period text, contribution12m numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  WITH valgte AS MATERIALIZED (
    SELECT c.id
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger) AND public.maalepunkt_adgang(_saelger)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND public.kundetype(c.customer_segment_3) <> 'intern'
  ), s AS (
    SELECT f.period, f.rev, f.contrib, f.kg_c4
    FROM public.sales_kunde_maaned f
    JOIN valgte v ON v.id = f.company_id
    WHERE f.period >= _start_prior AND f.period <= _last_full
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
    CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0) ELSE NULL END
  FROM s CROSS JOIN w
  GROUP BY w.ref, w.start_cur_ytd, w.start_prior_ytd, w.end_prior_ytd;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portfolio_aggregat(_saelger uuid DEFAULT NULL::uuid, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, city text, customer_type text, has_active_equipment boolean, last_consumable_sales_date date, last_sales_date date, employees integer, is_public boolean, sektor text, revenue12m numeric, revenue12m_prior numeric, revenue_ytd numeric, revenue_ytd_prior numeric, ytd_prior_last_month_rev numeric, contribution12m numeric, monthly numeric[], cons_perioder text[], vare_grupper text[], consumable_rev12m numeric, last_sales_now text, last_sales_prior text, last_cons_now text, last_cons_prior text, assigned_to uuid, saelger_navn text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  SELECT max(f.period) INTO _ref
  FROM public.sales_kunde_maaned f
  JOIN public.companies c ON c.id = f.company_id
  WHERE f.period >= _start_prior AND f.period <= _last_full
    AND c.afdeling_nr = ANY (_afd)
    AND c.afloest_af_company_id IS NULL
    AND (_saelger IS NULL OR c.assigned_to = _saelger) AND public.maalepunkt_adgang(_saelger)
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
           c.assigned_to AS assigned_to, pr.full_name AS saelger_navn
    FROM public.companies c
    LEFT JOIN public.profiles pr ON pr.id = c.assigned_to
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger) AND public.maalepunkt_adgang(_saelger)
      AND (_afdeling_nr IS NULL OR c.afdeling_nr = _afdeling_nr)
      AND public.kundetype(c.customer_segment_3) <> 'intern'
  ), s AS MATERIALIZED (
    SELECT f.*
    FROM public.sales_kunde_maaned f
    JOIN valgte v ON v.id = f.company_id
    WHERE f.period >= _start_prior
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

CREATE OR REPLACE FUNCTION public.seneste_fakturadato()
 RETURNS date
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT max(faktura_dato) FROM public.invoice_lines WHERE faktura_dato <= current_date),
    (SELECT max(last_invoice_date) FROM public.sales_monthly),
    current_date)
$function$;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_faktura_dato ON public.invoice_lines (faktura_dato);
