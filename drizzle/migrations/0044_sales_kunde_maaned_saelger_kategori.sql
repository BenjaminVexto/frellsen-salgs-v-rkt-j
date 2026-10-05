-- Sælger, kundekategori og kundens afdeling gemmes i den forudberegnede tabel,
-- så målepunkter og portefølje ikke skal slå tusindvis af kunder op pr. kald.
-- Holdes ajour ved sælgertildeling og Aktør-import via trigger på companies.
ALTER TABLE public.sales_kunde_maaned
  ADD COLUMN saelger uuid,
  ADD COLUMN kat text,
  ADD COLUMN c_afd integer,
  ADD COLUMN gyldig boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sales_kunde_maaned.saelger IS 'companies.assigned_to (ajourført af trigger)';
COMMENT ON COLUMN public.sales_kunde_maaned.kat IS 'maalepunkt_kundekategori(); NULL = intern kunde';
COMMENT ON COLUMN public.sales_kunde_maaned.c_afd IS 'companies.afdeling_nr';
COMMENT ON COLUMN public.sales_kunde_maaned.gyldig IS 'companies.afloest_af_company_id IS NULL';

UPDATE public.sales_kunde_maaned f
SET saelger = c.assigned_to,
    kat = public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3),
    c_afd = c.afdeling_nr,
    gyldig = (c.afloest_af_company_id IS NULL)
FROM public.companies c
WHERE c.id = f.company_id;

CREATE INDEX idx_skm_afd_saelger_period ON public.sales_kunde_maaned (c_afd, saelger, period);
ANALYZE public.sales_kunde_maaned;

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
    (company_id, afdeling_nr, period, rev, contrib, kg, rev_fg, contrib_fg, pos_fg, pos_any,
     rev_ex16, rev_c4, kg_c4, pos_c4, koder, has_fg, saelger, kat, c_afd, gyldig)
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
         coalesce(bool_or(x.pg1 = ANY (_fg)), false),
         c.assigned_to,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3),
         c.afdeling_nr,
         coalesce(c.afloest_af_company_id IS NULL, false)
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
  LEFT JOIN public.companies c ON c.id = x.company_id
  GROUP BY x.company_id, x.afdeling_nr, x.period,
           c.assigned_to, c.binding_status, c.customer_segment_3, c.afdeling_nr, c.afloest_af_company_id;

  DELETE FROM pg_temp._skm_keys;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._skm_refresh_keys() FROM PUBLIC, anon, authenticated;

-- Sælgertildeling / Aktør-import: opdatér de berørte kunders rækker.
CREATE OR REPLACE FUNCTION public._skm_company_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.sales_kunde_maaned f
  SET saelger = NEW.assigned_to,
      kat = public.maalepunkt_kundekategori(NEW.binding_status, NEW.customer_segment_3),
      c_afd = NEW.afdeling_nr,
      gyldig = (NEW.afloest_af_company_id IS NULL)
  WHERE f.company_id = NEW.id;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_skm_company_changed
AFTER UPDATE OF assigned_to, binding_status, customer_segment_3, afdeling_nr, afloest_af_company_id
ON public.companies
FOR EACH ROW
WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
   OR OLD.binding_status IS DISTINCT FROM NEW.binding_status
   OR OLD.customer_segment_3 IS DISTINCT FROM NEW.customer_segment_3
   OR OLD.afdeling_nr IS DISTINCT FROM NEW.afdeling_nr
   OR OLD.afloest_af_company_id IS DISTINCT FROM NEW.afloest_af_company_id)
EXECUTE FUNCTION public._skm_company_changed();

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
  SELECT f.period, f.kat, round(sum(CASE WHEN _forbrug THEN f.rev_fg ELSE f.rev END), 2)
  FROM public.sales_kunde_maaned f
  WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
    AND (_saelger IS NULL OR f.saelger = _saelger)
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
  SELECT f.period, f.kat, round(sum(CASE WHEN _forbrug THEN f.contrib_fg ELSE f.contrib END), 2)
  FROM public.sales_kunde_maaned f
  WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
    AND (_saelger IS NULL OR f.saelger = _saelger)
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
  ), oms AS (
    SELECT DISTINCT f.company_id, f.period, f.kat
    FROM public.sales_kunde_maaned f
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
      AND (_saelger IS NULL OR f.saelger = _saelger)
      AND f.afdeling_nr = ANY (_afd) AND f.pos_fg
      AND f.period >= (date_trunc('month', _fra) - interval '2 months')::date
      AND f.period < date_trunc('month', current_date)::date
  ), akt AS (
    SELECT DISTINCT m.maaned, o.company_id, o.kat
    FROM mdr m JOIN oms o ON o.period <= m.maaned AND o.period >= (m.maaned - interval '2 months')::date
  )
  SELECT a.maaned, a.kat, count(*)::int
  FROM akt a
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
  SELECT x.kat, count(*)::int
  FROM (
    SELECT DISTINCT f.company_id, f.kat
    FROM public.sales_kunde_maaned f
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
      AND (_saelger IS NULL OR f.saelger = _saelger)
      AND f.afdeling_nr = ANY (_afd) AND f.pos_fg
      AND f.period >= (date_trunc('month', _fra) - interval '2 months')::date
      AND f.period <= LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date)
  ) x
  GROUP BY 1;
END $function$;

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
    CASE WHEN _maa_db THEN coalesce(sum(s.contrib) FILTER (WHERE s.period >= w.start_cur_ytd AND s.period <= w.ref), 0) ELSE NULL END
  FROM s CROSS JOIN w
  GROUP BY w.ref, w.start_cur_ytd, w.start_prior_ytd, w.end_prior_ytd;
END;
$function$;
