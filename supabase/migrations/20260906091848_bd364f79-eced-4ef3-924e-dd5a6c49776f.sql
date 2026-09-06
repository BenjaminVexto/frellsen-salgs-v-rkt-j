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
  v_from date := (date_trunc('month', current_date) - interval '12 months')::date;
  v_to date := date_trunc('month', current_date)::date;
  v_paalidelig boolean;
  v_foerer jsonb;
  v_mangler jsonb;
  v_relevante int;
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

  CREATE TEMP TABLE _norm ON COMMIT DROP AS
  SELECT sp.product_group_1, sp.pct, sp.kunder_i_alt, r.navn
    FROM public.sortiment_penetration sp
    JOIN public.produktgruppe_rolle r ON r.product_group_1 = sp.product_group_1
   WHERE sp.customer_segment_1 = v_seg;

  SELECT max(kunder_i_alt) INTO v_total FROM _norm;
  v_total := coalesce(v_total, 0);
  v_paalidelig := v_total >= 10;

  CREATE TEMP TABLE _foerer ON COMMIT DROP AS
  SELECT DISTINCT smp.product_group_1
    FROM public.sales_monthly_products smp
    JOIN public.locations l ON l.id = smp.location_id
   WHERE l.company_id = _company_id
     AND smp.period >= v_from AND smp.period < v_to;

  SELECT coalesce(jsonb_agg(jsonb_build_object('gruppe', n.product_group_1, 'navn', n.navn)
                            ORDER BY n.pct DESC NULLS LAST), '[]'::jsonb)
    INTO v_foerer
    FROM _norm n
   WHERE n.product_group_1 IN (SELECT product_group_1 FROM _foerer);

  SELECT count(*) INTO v_relevante FROM _norm WHERE pct >= 25;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'pct')::numeric DESC), '[]'::jsonb)
    INTO v_mangler
    FROM (
      SELECT jsonb_build_object(
               'gruppe', n.product_group_1,
               'navn', n.navn,
               'pct', CASE WHEN v_paalidelig THEN n.pct ELSE NULL END,
               'varer', CASE WHEN v_paalidelig THEN (
                 SELECT coalesce(jsonb_agg(v ORDER BY (v->>'kunder')::int DESC), '[]'::jsonb)
                   FROM (
                     SELECT jsonb_build_object(
                              'varenr', t.varenr,
                              'beskrivelse', t.description,
                              'kunder', t.kunder
                            ) AS v
                       FROM (
                         SELECT smp.varenr,
                                max(smp.description) AS description,
                                count(DISTINCT c2.id) AS kunder
                           FROM public.sales_monthly_products smp
                           JOIN public.locations l2 ON l2.id = smp.location_id
                           JOIN public.companies c2 ON c2.id = l2.company_id
                          WHERE smp.afdeling_nr = 21
                            AND smp.product_group_1 = n.product_group_1
                            AND coalesce(c2.customer_segment_1, '') = v_seg
                            AND c2.afloest_af_company_id IS NULL
                            AND smp.period >= v_from AND smp.period < v_to
                          GROUP BY smp.varenr
                          ORDER BY count(DISTINCT c2.id) DESC
                          LIMIT 3
                       ) t
                   ) s
               ) ELSE '[]'::jsonb END
             ) AS x
        FROM _norm n
       WHERE n.pct >= 25
         AND n.product_group_1 NOT IN (SELECT product_group_1 FROM _foerer)
       ORDER BY n.pct DESC
       LIMIT 5
    ) q;

  RETURN jsonb_build_object(
    'vises', true,
    'segment', v_seg,
    'kunder_i_alt', v_total,
    'paalidelig', v_paalidelig,
    'relevante_i_alt', coalesce(v_relevante, 0),
    'foerer', v_foerer,
    'mangler', v_mangler
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.sortiment_daekning(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sortiment_daekning(uuid) TO authenticated, service_role;