CREATE OR REPLACE FUNCTION public.efterfoelger_kaede(_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE k(id) AS (
    SELECT _id
    UNION
    SELECT CASE WHEN r.from_company_id = k.id THEN r.to_company_id ELSE r.from_company_id END
    FROM public.company_relations r JOIN k ON k.id IN (r.from_company_id, r.to_company_id)
    WHERE r.relation_type = 'efterfoelger'
  )
  SELECT array_agg(id) FROM k
$$;

CREATE OR REPLACE FUNCTION public.efterfoelger_par()
RETURNS TABLE(company_id uuid, medlem_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT x.c, m FROM (
    SELECT DISTINCT unnest(ARRAY[from_company_id, to_company_id]) c
    FROM public.company_relations WHERE relation_type = 'efterfoelger'
  ) x, unnest(public.efterfoelger_kaede(x.c)) m
  WHERE m <> x.c
$$;

CREATE OR REPLACE FUNCTION public._har_koebende_forgaenger(_id uuid, _foer date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE anc(id) AS (
    SELECT r.from_company_id FROM public.company_relations r
    WHERE r.to_company_id = _id AND r.relation_type = 'efterfoelger'
    UNION
    SELECT r.from_company_id FROM public.company_relations r JOIN anc ON r.to_company_id = anc.id
    WHERE r.relation_type = 'efterfoelger'
  )
  SELECT EXISTS (SELECT 1 FROM anc JOIN public.sales_monthly sm ON sm.company_id = anc.id
                 WHERE sm.revenue > 0 AND sm.period < _foer)
$$;

CREATE OR REPLACE FUNCTION public._har_aktiv_efterfoelger(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE des(id) AS (
    SELECT r.to_company_id FROM public.company_relations r
    WHERE r.from_company_id = _id AND r.relation_type = 'efterfoelger'
    UNION
    SELECT r.to_company_id FROM public.company_relations r JOIN des ON r.from_company_id = des.id
    WHERE r.relation_type = 'efterfoelger'
  )
  SELECT EXISTS (SELECT 1 FROM des JOIN public.sales_monthly sm ON sm.company_id = des.id
                 WHERE sm.revenue > 0
                   AND sm.period >= (date_trunc('month', public.seneste_fakturadato()) - interval '6 months')::date)
$$;

REVOKE EXECUTE ON FUNCTION public.efterfoelger_kaede(uuid), public.efterfoelger_par(),
  public._har_koebende_forgaenger(uuid, date), public._har_aktiv_efterfoelger(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.efterfoelger_kaede(uuid), public._har_aktiv_efterfoelger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.efterfoelger_kaede(uuid), public.efterfoelger_par(),
  public._har_koebende_forgaenger(uuid, date), public._har_aktiv_efterfoelger(uuid) TO service_role;

CREATE POLICY efterfoelger_kun_admin ON public.company_relations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (relation_type <> 'efterfoelger' OR public.is_admin(auth.uid()));
CREATE POLICY efterfoelger_kun_admin_upd ON public.company_relations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (relation_type <> 'efterfoelger' OR public.is_admin(auth.uid()))
  WITH CHECK (relation_type <> 'efterfoelger' OR public.is_admin(auth.uid()));
CREATE POLICY efterfoelger_kun_admin_del ON public.company_relations AS RESTRICTIVE FOR DELETE TO authenticated
  USING (relation_type <> 'efterfoelger' OR public.is_admin(auth.uid()));

CREATE TABLE public.efterfoelger_forslag_afvist (
  fra_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  til_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  afvist_af uuid DEFAULT auth.uid(),
  afvist_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fra_company_id, til_company_id)
);
GRANT SELECT, INSERT, DELETE ON public.efterfoelger_forslag_afvist TO authenticated;
GRANT ALL ON public.efterfoelger_forslag_afvist TO service_role;
ALTER TABLE public.efterfoelger_forslag_afvist ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_alt ON public.efterfoelger_forslag_afvist FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.efterfoelger_forslag_afvist AS RESTRICTIVE FOR ALL
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

DO $mig$
DECLARE d text; o text; n text;
BEGIN
  d := pg_get_functiondef('public.maalepunkt_nye_kunder(uuid,date,date,integer)'::regprocedure);
  o := E'  FROM grp g\n  WHERE g.foerste_ordre IS NOT NULL\n';
  IF position(o IN d) = 0 THEN RAISE EXCEPTION 'nye_kunder: mønster ikke fundet'; END IF;
  EXECUTE replace(d, o, o || E'    AND NOT EXISTS (SELECT 1 FROM acc a2 WHERE a2.gkey = g.gkey AND public._har_koebende_forgaenger(a2.id, g.foerste_ordre))\n');

  d := pg_get_functiondef('public.maalepunkt_nye_kunder_detaljer(uuid,date,date,text,date,integer)'::regprocedure);
  o := E'    WHERE g.foerste_ordre IS NOT NULL\n';
  IF position(o IN d) = 0 THEN RAISE EXCEPTION 'detaljer: mønster ikke fundet'; END IF;
  EXECUTE replace(d, o, o || E'      AND NOT EXISTS (SELECT 1 FROM acc a2 WHERE a2.gkey = g.gkey AND public._har_koebende_forgaenger(a2.id, g.foerste_ordre))\n');

  d := pg_get_functiondef('public.maalepunkt_kpg45(text,uuid,date,date,integer,boolean)'::regprocedure);
  o := E'    WHERE g.kat = ''privat'' AND g.fo IS NOT NULL\n';
  IF position(o IN d) = 0 THEN RAISE EXCEPTION 'kpg45: mønster ikke fundet'; END IF;
  EXECUTE replace(d, o, o || E'      AND NOT EXISTS (SELECT 1 FROM kand k2 WHERE k2.gkey = g.gkey AND public._har_koebende_forgaenger(k2.id, g.fo))\n');

  d := pg_get_functiondef('public.kunde_rytme_genberegn(uuid[])'::regprocedure);
  o := E'  PERFORM set_config(''app.skm_skip'', ''on'', true);\n';
  IF position(o IN d) = 0 THEN RAISE EXCEPTION 'rytme: start ikke fundet'; END IF;
  d := replace(d, o, o || E'  IF _company_ids IS NOT NULL THEN\n    SELECT array_agg(DISTINCT m) INTO _company_ids FROM unnest(_company_ids) i, unnest(public.efterfoelger_kaede(i)) m;\n  END IF;\n');
  o := E'    SELECT sm.company_id, date_trunc(''month'', sm.period)::date AS m,\n           max(coalesce(sm.last_invoice_date, sm.period)) AS d\n    FROM public.sales_monthly sm JOIN co ON co.id = sm.company_id';
  IF position(o IN d) = 0 THEN RAISE EXCEPTION 'rytme: fbm ikke fundet'; END IF;
  n := E'    SELECT kk.company_id, date_trunc(''month'', sm.period)::date AS m,\n           max(coalesce(sm.last_invoice_date, sm.period)) AS d\n    FROM (SELECT co.id AS company_id, co.id AS kilde FROM co\n          UNION ALL SELECT p.company_id, p.medlem_id FROM public.efterfoelger_par() p JOIN co ON co.id = p.company_id) kk\n    JOIN public.sales_monthly sm ON sm.company_id = kk.kilde';
  EXECUTE replace(d, o, n);
END $mig$;

CREATE OR REPLACE FUNCTION public.kunde_stop_status(_ids uuid[])
 RETURNS TABLE(company_id uuid, stoppet boolean, skjult boolean, aarsag text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH aktive AS (
    SELECT s.*, public.kunde_stop_skjuler(s) AS skjuler FROM public.kunde_stop s
    WHERE s.company_id = ANY(_ids) AND s.fjernet_at IS NULL
  ), lok AS (
    SELECT l.company_id, count(*) AS n FROM public.locations l
    WHERE l.company_id IN (SELECT a.company_id FROM aktive a) GROUP BY l.company_id
  ), pr AS (
    SELECT a.company_id,
      bool_or(a.location_id IS NULL) AS virk_stop,
      bool_or(a.location_id IS NULL AND a.skjuler) AS virk_skjul,
      count(DISTINCT a.location_id) FILTER (WHERE a.location_id IS NOT NULL) AS lok_stop,
      count(DISTINCT a.location_id) FILTER (WHERE a.location_id IS NOT NULL AND a.skjuler) AS lok_skjul,
      (array_agg(a.aarsag ORDER BY (a.location_id IS NULL) DESC, a.oprettet_at DESC))[1] AS aarsag
    FROM aktive a GROUP BY a.company_id
  ), base AS (
    SELECT pr.company_id,
      pr.virk_stop OR (coalesce(lok.n,0) > 0 AND pr.lok_stop >= lok.n) AS stoppet,
      pr.virk_skjul OR (coalesce(lok.n,0) > 0 AND pr.lok_skjul >= lok.n) AS skjult,
      pr.aarsag, 1 AS src
    FROM pr LEFT JOIN lok ON lok.company_id = pr.company_id
    UNION ALL
    SELECT i, false, true, 'Fortsætter på efterfølgerkonto', 2
    FROM unnest(_ids) i
    WHERE EXISTS (SELECT 1 FROM public.company_relations r WHERE r.from_company_id = i AND r.relation_type = 'efterfoelger')
      AND public._har_aktiv_efterfoelger(i)
  )
  SELECT b.company_id, bool_or(b.stoppet), bool_or(b.skjult), (array_agg(b.aarsag ORDER BY b.src))[1]
  FROM base b
  WHERE public.can_view_company(auth.uid(), b.company_id) OR auth.uid() IS NULL
  GROUP BY b.company_id
$function$;

CREATE OR REPLACE FUNCTION public.company_group_monthly(_company_id uuid)
 RETURNS TABLE(period date, product_group_1 text, revenue numeric, weight_kg numeric, quantity numeric, contribution numeric, order_count integer, last_invoice_date date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select sm.period, sm.product_group_1,
    sum(sm.revenue)::numeric, sum(sm.weight_kg)::numeric, sum(sm.quantity)::numeric,
    case when public.maa_se_db(auth.uid()) then sum(sm.contribution)::numeric else null end,
    sum(sm.order_count)::integer, max(sm.last_invoice_date)
  from public.sales_monthly sm
  where sm.company_id = ANY (public.efterfoelger_kaede(_company_id))
  group by sm.period, sm.product_group_1
  order by sm.period asc, sm.product_group_1 asc
$function$;

CREATE OR REPLACE FUNCTION public.efterfoelger_links(_id uuid)
RETURNS TABLE(relation_id uuid, retning text, company_id uuid, navn text, visma_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, 'efterfoelger', c.id, c.name, c.visma_id FROM public.company_relations r
    JOIN public.companies c ON c.id = r.to_company_id
   WHERE r.from_company_id = _id AND r.relation_type = 'efterfoelger'
     AND public.er_crm_bruger() AND NOT public.er_telemarketing()
  UNION ALL
  SELECT r.id, 'forgaenger', c.id, c.name, c.visma_id FROM public.company_relations r
    JOIN public.companies c ON c.id = r.from_company_id
   WHERE r.to_company_id = _id AND r.relation_type = 'efterfoelger'
     AND public.er_crm_bruger() AND NOT public.er_telemarketing()
$$;

CREATE OR REPLACE FUNCTION public.efterfoelger_kandidater(_id uuid, _soeg text DEFAULT NULL)
RETURNS TABLE(company_id uuid, navn text, visma_id text, by text, samme_cvr boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _cvr text; _s text := nullif(btrim(coalesce(_soeg,'')), '');
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun administratorer'; END IF;
  SELECT public.cvr_norm(c.cvr) INTO _cvr FROM public.companies c WHERE c.id = _id;
  RETURN QUERY
  SELECT c.id, c.name, c.visma_id, c.city, coalesce(_cvr IS NOT NULL AND public.cvr_norm(c.cvr) = _cvr, false)
  FROM public.companies c
  WHERE c.id <> _id
    AND NOT (c.id = ANY (public.efterfoelger_kaede(_id)))
    AND (CASE WHEN _s IS NULL THEN _cvr IS NOT NULL AND public.cvr_norm(c.cvr) = _cvr
              ELSE c.name ILIKE '%' || _s || '%' OR c.visma_id LIKE _s || '%' END)
  ORDER BY 5 DESC, c.name
  LIMIT 25;
END $$;

CREATE OR REPLACE FUNCTION public.efterfoelger_saet(_fra uuid, _til uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _rid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun administratorer'; END IF;
  IF _fra = _til THEN RAISE EXCEPTION 'En konto kan ikke efterfølge sig selv'; END IF;
  IF _til = ANY (public.efterfoelger_kaede(_fra)) THEN RAISE EXCEPTION 'Kontiene er allerede i samme kæde'; END IF;
  IF EXISTS (SELECT 1 FROM public.company_relations WHERE from_company_id = _fra AND relation_type = 'efterfoelger') THEN
    RAISE EXCEPTION 'Kontoen har allerede en efterfølger – fjern den først';
  END IF;
  INSERT INTO public.company_relations (from_company_id, to_company_id, relation_type, created_by)
  VALUES (_fra, _til, 'efterfoelger', auth.uid()) RETURNING id INTO _rid;
  PERFORM public.kunde_rytme_genberegn(ARRAY[_fra, _til]);
  RETURN _rid;
END $$;

CREATE OR REPLACE FUNCTION public.efterfoelger_fjern(_relation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _f uuid; _t uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun administratorer'; END IF;
  SELECT from_company_id, to_company_id INTO _f, _t FROM public.company_relations
   WHERE id = _relation_id AND relation_type = 'efterfoelger';
  IF _f IS NULL THEN RETURN; END IF;
  DELETE FROM public.company_relations WHERE id = _relation_id;
  PERFORM public.kunde_rytme_genberegn(ARRAY[_f]);
  PERFORM public.kunde_rytme_genberegn(ARRAY[_t]);
END $$;

CREATE OR REPLACE FUNCTION public.efterfoelger_forslag(_afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(fra_id uuid, fra_navn text, fra_visma text, fra_sidste date, fra_snit numeric,
              til_id uuid, til_navn text, til_visma text, til_foerste date, til_snit numeric, cvr text, segment text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _fg text[] := public.maalepunkt_forbrug_grupper(); _ref date := date_trunc('month', public.seneste_fakturadato())::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun administratorer'; END IF;
  RETURN QUERY
  WITH kc AS MATERIALIZED (
    SELECT c.id, c.name, c.visma_id, public.cvr_norm(c.cvr) AS cvrn, c.customer_segment_1 AS seg, c.afdeling_nr
    FROM public.companies c
    WHERE c.afloest_af_company_id IS NULL AND c.customer_segment_1 IS NOT NULL
      AND public.cvr_norm(c.cvr) ~ '^\d{8}$'
  ), grp AS (
    SELECT kc.cvrn, kc.seg FROM kc GROUP BY 1, 2
    HAVING count(*) > 1 AND (_afdeling_nr IS NULL OR bool_or(kc.afdeling_nr = _afdeling_nr))
  ), k2 AS MATERIALIZED (
    SELECT kc.* FROM kc JOIN grp ON grp.cvrn = kc.cvrn AND grp.seg = kc.seg
  ), mm AS MATERIALIZED (
    SELECT sm.company_id, date_trunc('month', sm.period)::date AS m, sum(sm.revenue) AS r
    FROM public.sales_monthly sm JOIN k2 ON k2.id = sm.company_id
    WHERE substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
    GROUP BY 1, 2 HAVING sum(sm.revenue) > 0
  ), st AS (
    SELECT mm.company_id, min(mm.m) AS foerste, max(mm.m) AS sidste FROM mm GROUP BY 1
  ), gl AS (
    SELECT st.company_id, st.sidste,
      (SELECT coalesce(sum(x.r),0) FROM mm x WHERE x.company_id = st.company_id
         AND x.m > (st.sidste - interval '6 months')::date AND x.m <= st.sidste) / 6 AS snit
    FROM st WHERE st.sidste < (_ref - interval '2 months')::date
  ), ny AS (
    SELECT st.company_id, st.foerste,
      (SELECT coalesce(sum(x.r),0) FROM mm x WHERE x.company_id = st.company_id
         AND x.m >= st.foerste AND x.m < (st.foerste + interval '6 months')::date)
      / greatest(1, least(6, (extract(year from age(_ref, st.foerste))*12 + extract(month from age(_ref, st.foerste)))::int + 1)) AS snit
    FROM st
  )
  SELECT ko.id, ko.name, ko.visma_id, g.sidste, round(g.snit), kn.id, kn.name, kn.visma_id, n.foerste, round(n.snit), ko.cvrn, ko.seg
  FROM gl g
  JOIN k2 ko ON ko.id = g.company_id
  JOIN k2 kn ON kn.cvrn = ko.cvrn AND kn.seg = ko.seg AND kn.id <> ko.id
  JOIN ny n ON n.company_id = kn.id
  WHERE g.snit >= 3000
    AND (_afdeling_nr IS NULL OR ko.afdeling_nr = _afdeling_nr)
    AND n.foerste BETWEEN (g.sidste - interval '2 months')::date AND (g.sidste + interval '2 months')::date
    AND n.snit BETWEEN 0.4 * g.snit AND 2.5 * g.snit
    AND NOT EXISTS (SELECT 1 FROM public.company_relations r WHERE r.relation_type = 'efterfoelger'
                      AND (r.from_company_id = ko.id OR r.to_company_id = kn.id))
    AND NOT EXISTS (SELECT 1 FROM public.efterfoelger_forslag_afvist a WHERE a.fra_company_id = ko.id AND a.til_company_id = kn.id)
  ORDER BY g.snit DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.efterfoelger_links(uuid), public.efterfoelger_kandidater(uuid, text),
  public.efterfoelger_saet(uuid, uuid), public.efterfoelger_fjern(uuid), public.efterfoelger_forslag(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.efterfoelger_links(uuid), public.efterfoelger_kandidater(uuid, text),
  public.efterfoelger_saet(uuid, uuid), public.efterfoelger_fjern(uuid), public.efterfoelger_forslag(integer) TO authenticated, service_role;