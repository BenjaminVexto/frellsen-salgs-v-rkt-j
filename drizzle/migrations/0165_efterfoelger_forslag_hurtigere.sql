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
      AND c.cvr IS NOT NULL AND btrim(c.cvr) <> ''
  ), grp AS MATERIALIZED (
    SELECT kc.cvrn, kc.seg FROM kc WHERE kc.cvrn ~ '^\d{8}$' GROUP BY 1, 2
    HAVING count(*) > 1 AND (_afdeling_nr IS NULL OR bool_or(kc.afdeling_nr = _afdeling_nr))
  ), k2 AS MATERIALIZED (
    SELECT kc.* FROM kc JOIN grp ON grp.cvrn = kc.cvrn AND grp.seg = kc.seg
  ), mm AS MATERIALIZED (
    SELECT sm.company_id, date_trunc('month', sm.period)::date AS m, sum(sm.revenue) AS r
    FROM public.sales_monthly sm
    WHERE sm.company_id IN (SELECT k2.id FROM k2)
      AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
    GROUP BY 1, 2 HAVING sum(sm.revenue) > 0
  ), st AS MATERIALIZED (
    SELECT mm.company_id, min(mm.m) AS foerste, max(mm.m) AS sidste FROM mm GROUP BY 1
  ), gl AS (
    SELECT st.company_id, st.sidste,
      coalesce(sum(x.r) FILTER (WHERE x.m > (st.sidste - interval '6 months')::date), 0) / 6 AS snit
    FROM st JOIN mm x ON x.company_id = st.company_id
    WHERE st.sidste < (_ref - interval '2 months')::date
    GROUP BY st.company_id, st.sidste
  ), ny AS (
    SELECT st.company_id, st.foerste,
      coalesce(sum(x.r) FILTER (WHERE x.m < (st.foerste + interval '6 months')::date), 0)
      / greatest(1, least(6, (extract(year from age(_ref, st.foerste))*12 + extract(month from age(_ref, st.foerste)))::int + 1)) AS snit
    FROM st JOIN mm x ON x.company_id = st.company_id
    GROUP BY st.company_id, st.foerste
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