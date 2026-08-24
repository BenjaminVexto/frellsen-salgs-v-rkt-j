-- 1) Replace SECURITY DEFINER-style views (security_invoker=off) with
--    invoker views over definer functions returning only aggregate data.
CREATE OR REPLACE FUNCTION public.sales_period_completeness_rows()
RETURNS TABLE(period date, lokationer bigint, kg numeric,
              median_lokationer double precision, lokationer_sidste_aar bigint,
              pct_af_median numeric, er_komplet boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pr AS (
    SELECT sm.period, count(DISTINCT sm.location_id) AS lokationer, sum(sm.weight_kg) AS kg
    FROM public.sales_monthly sm WHERE sm.revenue > 0 GROUP BY sm.period
  )
  SELECT p.period, p.lokationer, p.kg, m.median_lokationer, ly.lokationer,
    CASE WHEN m.median_lokationer > 0
      THEN round(((100.0 * p.lokationer)::double precision / m.median_lokationer)::numeric, 1)
      ELSE NULL::numeric END,
    (p.period < (date_trunc('month', now()))::date
     AND (m.median_lokationer IS NULL OR p.lokationer::double precision >= 0.50::double precision * m.median_lokationer)
     AND (ly.lokationer IS NULL OR p.lokationer::numeric >= 0.60 * ly.lokationer::numeric))
  FROM pr p
  LEFT JOIN LATERAL (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lokationer::double precision) AS median_lokationer
    FROM pr x WHERE x.period < p.period AND x.period >= (p.period - interval '1 year')::date
  ) m ON true
  LEFT JOIN pr ly ON ly.period = (p.period - interval '1 year')::date
$$;

REVOKE ALL ON FUNCTION public.sales_period_completeness_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_period_completeness_rows() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.sales_period_completeness
WITH (security_invoker = on) AS
  SELECT * FROM public.sales_period_completeness_rows();

CREATE OR REPLACE FUNCTION public.sales_season_index_rows()
RETURNS TABLE(product_group_1 text, maaned integer, maaneder_i_grundlag bigint,
              komplette_maaneder_i_alt numeric, saeson_indeks numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH komplet AS (
    SELECT c.period FROM public.sales_period_completeness_rows() c WHERE c.er_komplet
  ), g AS (
    SELECT sm.product_group_1, (EXTRACT(month FROM sm.period))::integer AS maaned,
           sum(sm.weight_kg) AS kg, count(DISTINCT sm.period) AS maaneder_i_grundlag
    FROM public.sales_monthly sm JOIN komplet k ON k.period = sm.period
    GROUP BY sm.product_group_1, ((EXTRACT(month FROM sm.period))::integer)
  ), snit AS (
    SELECT g1.product_group_1,
           sum(g1.kg) / NULLIF(sum(g1.maaneder_i_grundlag), 0) AS kg_pr_maaned_gns,
           sum(g1.maaneder_i_grundlag) AS komplette_maaneder_i_alt
    FROM g g1 GROUP BY g1.product_group_1
  )
  SELECT g.product_group_1, g.maaned, g.maaneder_i_grundlag, s.komplette_maaneder_i_alt,
         round((g.kg / NULLIF(g.maaneder_i_grundlag, 0)::numeric) / NULLIF(s.kg_pr_maaned_gns, 0), 4)
  FROM g JOIN snit s USING (product_group_1)
  WHERE s.kg_pr_maaned_gns > 0
$$;

REVOKE ALL ON FUNCTION public.sales_season_index_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_season_index_rows() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.sales_season_index
WITH (security_invoker = on) AS
  SELECT * FROM public.sales_season_index_rows();

REVOKE ALL ON public.sales_season_index FROM anon;
REVOKE ALL ON public.sales_period_completeness FROM anon;
GRANT SELECT ON public.sales_season_index TO authenticated, service_role;
GRANT SELECT ON public.sales_period_completeness TO authenticated, service_role;

-- 2) Storage read policy on agreement-documents scoped to authenticated
DROP POLICY IF EXISTS "agreement_docs_read" ON storage.objects;
CREATE POLICY "agreement_docs_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'agreement-documents'
  AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'salgssupport'::app_role)));

-- 3) company_relations read scoped to accessible companies
DROP POLICY IF EXISTS "auth read relations" ON public.company_relations;
CREATE POLICY "auth read relations" ON public.company_relations
FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), from_company_id)
    OR public.can_access_company(auth.uid(), to_company_id));

-- 4) company_relation_suggestions read scoped to accessible companies
DROP POLICY IF EXISTS "auth read suggestions" ON public.company_relation_suggestions;
CREATE POLICY "auth read suggestions" ON public.company_relation_suggestions
FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), from_company_id)
    OR public.can_access_company(auth.uid(), to_company_id));

-- 5) forbrug_signal_historik read scoped to accessible companies/departments
DROP POLICY IF EXISTS "fsh_read" ON public.forbrug_signal_historik;
CREATE POLICY "fsh_read" ON public.forbrug_signal_historik
FOR SELECT TO authenticated
USING (
  CASE
    WHEN company_id IS NOT NULL THEN public.can_access_company(auth.uid(), company_id)
    ELSE afdeling_nr IS NOT NULL AND afdeling_nr = ANY (public.my_afdelinger())
  END
);