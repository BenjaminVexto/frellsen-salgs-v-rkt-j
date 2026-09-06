CREATE OR REPLACE VIEW public.sortiment_penetration
WITH (security_invoker = true) AS
WITH per AS (
  SELECT DISTINCT
    coalesce(c.customer_segment_1, '') AS customer_segment_1,
    smp.product_group_1,
    c.id AS company_id
  FROM public.sales_monthly_products smp
  JOIN public.locations l ON l.id = smp.location_id
  JOIN public.companies c ON c.id = l.company_id
  JOIN public.produktgruppe_rolle r ON r.product_group_1 = smp.product_group_1
  WHERE smp.afdeling_nr = 21
    AND r.indgaar_i_sortiment
    AND c.afloest_af_company_id IS NULL
    AND smp.period >= (date_trunc('month', current_date) - interval '11 months')::date
    AND smp.period <  (date_trunc('month', current_date) + interval '1 month')::date
),
kunder AS (
  SELECT customer_segment_1, count(DISTINCT company_id) AS total
  FROM per GROUP BY 1
)
SELECT
  p.customer_segment_1,
  p.product_group_1,
  count(DISTINCT p.company_id)::bigint AS kunder_med_gruppen,
  k.total::bigint AS kunder_i_alt,
  round(100.0 * count(DISTINCT p.company_id) / nullif(k.total, 0), 1) AS pct
FROM per p
JOIN kunder k ON k.customer_segment_1 = p.customer_segment_1
GROUP BY p.customer_segment_1, p.product_group_1, k.total;

GRANT SELECT ON public.sortiment_penetration TO authenticated;

CREATE OR REPLACE FUNCTION public.sortiment_daekning(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_afd int;
  v_seg text;
  v_total int := 0;
  v_from date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_to date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_paalidelig boolean;
  v_foerer jsonb;
  v_mangler jsonb;
  v_relevante int;
  v_foerer_relevante int;
  v_foerer_grupper text[];
BEGIN
  IF NOT public.can_access_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Ingen adgang til virksomheden';
  END IF;

  SELECT afdeling_nr, coalesce(customer_segment_1, '')
    INTO v_afd, v_seg
    FROM public.companies WHERE id = _company_id;

  IF v_afd IS DISTINCT FROM 21
     OR left(btrim(v_seg), 4) IN ('1055', '1096') THEN
    RETURN jsonb_build_object('vises', false);
  END IF;

  SELECT max(sp.kunder_i_alt) INTO v_total
    FROM public.sortiment_penetration sp
   WHERE sp.customer_segment_1 = v_seg;
  v_total := coalesce(v_total, 0);
  v_paalidelig := v_total >= 10;

  SELECT coalesce(array_agg(DISTINCT smp.product_group_1), '{}')
    INTO v_foerer_grupper
    FROM public.sales_monthly_products smp
    JOIN public.locations l ON l.id = smp.location_id
   WHERE l.company_id = _company_id
     AND smp.period >= v_from AND smp.period < v_to;

  SELECT coalesce(jsonb_agg(jsonb_build_object('gruppe', sp.product_group_1,
                                               'navn', public.gruppe_navn(v_afd, sp.product_group_1))
                            ORDER BY sp.pct DESC NULLS LAST), '[]'::jsonb)
    INTO v_foerer
    FROM public.sortiment_penetration sp
   WHERE sp.customer_segment_1 = v_seg
     AND sp.product_group_1 = ANY (v_foerer_grupper);

  SELECT count(*) FILTER (WHERE sp.pct >= 25),
         count(*) FILTER (WHERE sp.pct >= 25 AND sp.product_group_1 = ANY (v_foerer_grupper))
    INTO v_relevante, v_foerer_relevante
    FROM public.sortiment_penetration sp
   WHERE sp.customer_segment_1 = v_seg;

  SELECT coalesce(jsonb_agg(q.x ORDER BY q.pct DESC), '[]'::jsonb)
    INTO v_mangler
    FROM (
      SELECT sp.pct AS pct,
             jsonb_build_object(
               'gruppe', sp.product_group_1,
               'navn', public.gruppe_navn(v_afd, sp.product_group_1),
               'pct', CASE WHEN v_paalidelig THEN sp.pct ELSE NULL END,
               'varer', CASE WHEN v_paalidelig THEN (
                 SELECT coalesce(jsonb_agg(
                          jsonb_build_object(
                            'varenr', t.varenr,
                            'beskrivelse', t.description,
                            'kunder', t.kunder
                          ) ORDER BY t.kunder DESC), '[]'::jsonb)
                   FROM (
                     SELECT smp.varenr,
                            max(smp.description) AS description,
                            count(DISTINCT c2.id) AS kunder
                       FROM public.sales_monthly_products smp
                       JOIN public.locations l2 ON l2.id = smp.location_id
                       JOIN public.companies c2 ON c2.id = l2.company_id
                      WHERE smp.afdeling_nr = 21
                        AND smp.product_group_1 = sp.product_group_1
                        AND coalesce(c2.customer_segment_1, '') = v_seg
                        AND c2.afloest_af_company_id IS NULL
                        AND smp.period >= v_from AND smp.period < v_to
                      GROUP BY smp.varenr
                      ORDER BY count(DISTINCT c2.id) DESC
                      LIMIT 3
                   ) t
               ) ELSE '[]'::jsonb END
             ) AS x
        FROM public.sortiment_penetration sp
       WHERE sp.customer_segment_1 = v_seg
         AND sp.pct >= 25
         AND NOT (sp.product_group_1 = ANY (v_foerer_grupper))
       ORDER BY sp.pct DESC
    ) q;

  RETURN jsonb_build_object(
    'vises', true,
    'segment', v_seg,
    'kunder_i_alt', v_total,
    'paalidelig', v_paalidelig,
    'relevante_i_alt', coalesce(v_relevante, 0),
    'foerer_relevante', coalesce(v_foerer_relevante, 0),
    'mangler_i_alt', coalesce(v_relevante, 0) - coalesce(v_foerer_relevante, 0),
    'foerer', v_foerer,
    'mangler', v_mangler
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.sortiment_daekning(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sortiment_daekning(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.te_sortiment_kunde(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_afd int;
  v_seg text;
  v_from date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_to date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_total int := 0;
  v_har_te boolean;
  v_ukendt int := 0;
  v_linjer jsonb;
BEGIN
  IF NOT public.can_access_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Ingen adgang til virksomheden';
  END IF;

  SELECT afdeling_nr, coalesce(customer_segment_1, '')
    INTO v_afd, v_seg
    FROM public.companies WHERE id = _company_id;

  IF v_afd IS DISTINCT FROM 21 THEN
    RETURN jsonb_build_object('vises', false);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sales_monthly_products smp
      JOIN public.locations l ON l.id = smp.location_id
     WHERE l.company_id = _company_id
       AND smp.product_group_1 = '4'
       AND smp.period >= v_from AND smp.period < v_to
  ) INTO v_har_te;

  IF NOT v_har_te THEN
    RETURN jsonb_build_object('vises', false);
  END IF;

  SELECT count(DISTINCT c.id) INTO v_total
    FROM public.sales_monthly_products smp
    JOIN public.locations l ON l.id = smp.location_id
    JOIN public.companies c ON c.id = l.company_id
   WHERE c.afdeling_nr = 21
     AND c.afloest_af_company_id IS NULL
     AND coalesce(c.customer_segment_1, '') = v_seg
     AND smp.product_group_1 = '4'
     AND smp.period >= v_from AND smp.period < v_to;
  v_total := coalesce(v_total, 0);

  SELECT count(DISTINCT smp.varenr) INTO v_ukendt
    FROM public.sales_monthly_products smp
    JOIN public.locations l ON l.id = smp.location_id
    LEFT JOIN public.products p ON p.varenr = smp.varenr
   WHERE l.company_id = _company_id
     AND smp.product_group_1 = '4'
     AND smp.period >= v_from AND smp.period < v_to
     AND (p.varenr IS NULL OR p.te_type IS NULL OR p.te_type = 'ukendt');

  WITH kunde AS (
    SELECT p.te_type,
           count(DISTINCT smp.varenr) AS varenumre,
           sum(smp.weight_kg) AS kg,
           max(smp.period) AS sidste_periode
      FROM public.sales_monthly_products smp
      JOIN public.locations l ON l.id = smp.location_id
      JOIN public.products p ON p.varenr = smp.varenr
     WHERE l.company_id = _company_id
       AND smp.product_group_1 = '4'
       AND smp.period >= v_from AND smp.period < v_to
       AND p.te_type IS NOT NULL AND p.te_type <> 'ukendt'
     GROUP BY p.te_type
  ), norm AS (
    SELECT p.te_type,
           count(DISTINCT c.id) AS kunder
      FROM public.sales_monthly_products smp
      JOIN public.locations l ON l.id = smp.location_id
      JOIN public.companies c ON c.id = l.company_id
      JOIN public.products p ON p.varenr = smp.varenr
     WHERE c.afdeling_nr = 21
       AND c.afloest_af_company_id IS NULL
       AND coalesce(c.customer_segment_1, '') = v_seg
       AND smp.product_group_1 = '4'
       AND smp.period >= v_from AND smp.period < v_to
       AND p.te_type IS NOT NULL AND p.te_type <> 'ukendt'
     GROUP BY p.te_type
  ), typer AS (
    SELECT n.te_type,
           CASE WHEN v_total > 0 THEN round(100.0 * n.kunder / v_total, 0) ELSE NULL END AS pct,
           (k.te_type IS NOT NULL) AS foerer,
           k.varenumre, k.kg, k.sidste_periode
      FROM norm n
      LEFT JOIN kunde k ON k.te_type = n.te_type
     WHERE v_total = 0 OR (100.0 * n.kunder / v_total) >= 10
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'te_type', t.te_type,
             'pct', t.pct,
             'foerer', t.foerer,
             'varenumre', coalesce(t.varenumre, 0),
             'kg', coalesce(t.kg, 0),
             'sidste_koeb', t.sidste_periode,
             'varer', CASE WHEN t.foerer THEN '[]'::jsonb ELSE (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'varenr', x.varenr,
                        'beskrivelse', x.beskrivelse,
                        'kunder', x.kunder
                      ) ORDER BY x.kunder DESC), '[]'::jsonb)
                 FROM (
                   SELECT smp.varenr,
                          coalesce(max(pr.beskrivelse), max(smp.description)) AS beskrivelse,
                          count(DISTINCT c2.id) AS kunder
                     FROM public.sales_monthly_products smp
                     JOIN public.locations l2 ON l2.id = smp.location_id
                     JOIN public.companies c2 ON c2.id = l2.company_id
                     JOIN public.products pr ON pr.varenr = smp.varenr
                    WHERE c2.afdeling_nr = 21
                      AND c2.afloest_af_company_id IS NULL
                      AND coalesce(c2.customer_segment_1, '') = v_seg
                      AND smp.product_group_1 = '4'
                      AND smp.period >= v_from AND smp.period < v_to
                      AND pr.te_type = t.te_type
                    GROUP BY smp.varenr
                    ORDER BY count(DISTINCT c2.id) DESC
                    LIMIT 3
                 ) x
             ) END
           ) ORDER BY t.pct DESC NULLS LAST
         ), '[]'::jsonb)
    INTO v_linjer
    FROM typer t;

  RETURN jsonb_build_object(
    'vises', true,
    'segment', v_seg,
    'kunder_i_alt', v_total,
    'ukendt_linjer', coalesce(v_ukendt, 0),
    'linjer', v_linjer
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.te_sortiment_kunde(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.te_sortiment_kunde(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.te_sortiment_oversigt()
RETURNS TABLE(
  company_id uuid,
  name text,
  customer_segment_1 text,
  saelger text,
  kg_total numeric,
  kg_pr_type jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH tilgaengelige AS (
    SELECT c.id, c.name, coalesce(c.customer_segment_1, '') AS seg,
           pr.full_name AS saelger
      FROM public.companies c
      LEFT JOIN public.profiles pr ON pr.id = c.assigned_to
     WHERE c.afdeling_nr = 21
       AND 21 = ANY ((SELECT public.my_afdelinger())::int[])
       AND c.afloest_af_company_id IS NULL
       AND left(btrim(coalesce(c.customer_segment_1, '')), 4) NOT IN ('1055', '1096')
       AND (
         public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'salgssupport')
         OR c.assigned_to = auth.uid()
       )
  ), salg AS (
    SELECT l.company_id,
           coalesce(nullif(p.te_type, 'ukendt'), 'ukendt') AS te_type,
           sum(smp.weight_kg) AS kg
      FROM public.sales_monthly_products smp
      JOIN public.locations l ON l.id = smp.location_id
      LEFT JOIN public.products p ON p.varenr = smp.varenr
     WHERE smp.afdeling_nr = 21
       AND smp.product_group_1 = '4'
       AND smp.period >= (date_trunc('month', current_date) - interval '11 months')::date
       AND smp.period < (date_trunc('month', current_date) + interval '1 month')::date
     GROUP BY l.company_id, 2
  )
  SELECT t.id, t.name, t.seg, t.saelger,
         round(coalesce(sum(s.kg), 0)::numeric, 1) AS kg_total,
         coalesce(jsonb_object_agg(s.te_type, round(s.kg::numeric, 1))
                  FILTER (WHERE s.te_type IS NOT NULL), '{}'::jsonb) AS kg_pr_type
    FROM tilgaengelige t
    JOIN salg s ON s.company_id = t.id
   GROUP BY t.id, t.name, t.seg, t.saelger
$fn$;

REVOKE ALL ON FUNCTION public.te_sortiment_oversigt() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.te_sortiment_oversigt() TO authenticated, service_role;