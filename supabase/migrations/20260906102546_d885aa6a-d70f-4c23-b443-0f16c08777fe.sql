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
  v_from date := (date_trunc('month', current_date) - interval '12 months')::date;
  v_to date := date_trunc('month', current_date)::date;
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

  -- Sammenlignelige butikker: samme kundeprisgruppe, køb i varegruppe 4.
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

  -- Telinjer uden brugbar type hos kunden.
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
       AND smp.period >= (date_trunc('month', current_date) - interval '12 months')::date
       AND smp.period < date_trunc('month', current_date)::date
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