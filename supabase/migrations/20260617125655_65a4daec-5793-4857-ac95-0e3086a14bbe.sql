
ALTER TABLE public.agreement_pricing
  ADD COLUMN IF NOT EXISTS saerpris_kr numeric;

DROP FUNCTION IF EXISTS public.get_quote_floor_discount(uuid, text);

CREATE OR REPLACE FUNCTION public.get_quote_floor_discount(p_company_id uuid, p_varenr text)
 RETURNS TABLE(rabat_pct numeric, rabat_kr numeric, kilde text, er_saerpris boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visma text;
  v_kp1 text;
  v_kp2 text;
  v_p_pg1 text;
  v_p_pg2 text;
  v_p_pg3 text;
BEGIN
  SELECT NULLIF(NULLIF(trim(visma_id), ''), '0'),
         NULLIF(NULLIF(substring(trim(customer_segment_1) from '^(\d+)'), ''), '0'),
         NULLIF(NULLIF(substring(trim(customer_segment_2) from '^(\d+)'), ''), '0')
    INTO v_visma, v_kp1, v_kp2
  FROM public.companies WHERE id = p_company_id;

  SELECT NULLIF(NULLIF(substring(produktprisgruppe_1 from '^(\d+)'), ''), '0'),
         NULLIF(NULLIF(substring(produktprisgruppe_2 from '^(\d+)'), ''), '0'),
         NULLIF(NULLIF(substring(produktprisgruppe_3 from '^(\d+)'), ''), '0')
    INTO v_p_pg1, v_p_pg2, v_p_pg3
  FROM public.products WHERE varenr = p_varenr;

  RETURN QUERY
  WITH src AS (
    SELECT ap.*,
      NULLIF(NULLIF(trim(ap.fak_kundenr), ''), '0') AS row_kundenr,
      NULLIF(NULLIF(substring(ap.kundeprisgruppe1 from '^(\d+)'), ''), '0') AS row_kp1,
      NULLIF(NULLIF(substring(ap.kundeprisgruppe2 from '^(\d+)'), ''), '0') AS row_kp2,
      NULLIF(NULLIF(trim(ap.varenr), ''), '0') AS row_varenr,
      NULLIF(NULLIF(substring(ap.produktprisgruppe1 from '^(\d+)'), ''), '0') AS row_pg1,
      NULLIF(NULLIF(substring(ap.produktprisgruppe2 from '^(\d+)'), ''), '0') AS row_pg2,
      NULLIF(NULLIF(substring(ap.produktprisgruppe3 from '^(\d+)'), ''), '0') AS row_pg3
    FROM public.agreement_pricing ap
    WHERE ap.record_status = 'aktiv'
      AND (ap.fra_dato IS NULL OR ap.fra_dato <= CURRENT_DATE)
      AND (ap.til_dato IS NULL OR ap.til_dato >= CURRENT_DATE)
  ),
  customer_matched AS (
    SELECT s.*,
      CASE
        WHEN s.row_kundenr IS NOT NULL AND v_visma IS NOT NULL AND s.row_kundenr = v_visma THEN 'kundenr'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NOT NULL AND s.row_kp2 IS NOT NULL
             AND s.row_kp1 = v_kp1 AND s.row_kp2 = v_kp2 THEN 'kp1+kp2'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NOT NULL AND s.row_kp2 IS NULL
             AND s.row_kp1 = v_kp1 THEN 'kp1'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NULL AND s.row_kp2 IS NOT NULL
             AND s.row_kp2 = v_kp2 THEN 'kp2'
        ELSE NULL
      END AS match_source,
      CASE
        WHEN s.row_kundenr IS NOT NULL AND v_visma IS NOT NULL AND s.row_kundenr = v_visma THEN 4
        WHEN s.row_kundenr IS NULL AND s.row_kp1 = v_kp1 AND s.row_kp2 = v_kp2 THEN 3
        WHEN s.row_kundenr IS NULL AND s.row_kp1 = v_kp1 AND s.row_kp2 IS NULL THEN 2
        WHEN s.row_kundenr IS NULL AND s.row_kp2 = v_kp2 AND s.row_kp1 IS NULL THEN 1
        ELSE 0
      END AS cust_prio
    FROM src s
  ),
  product_matched AS (
    SELECT cm.*,
      CASE
        WHEN cm.row_varenr = p_varenr THEN 4
        WHEN cm.row_varenr IS NULL
             AND (cm.row_pg1 IS NULL OR cm.row_pg1 = v_p_pg1)
             AND (cm.row_pg2 IS NULL OR cm.row_pg2 = v_p_pg2)
             AND (cm.row_pg3 IS NULL OR cm.row_pg3 = v_p_pg3)
             AND (cm.row_pg1 IS NOT NULL OR cm.row_pg2 IS NOT NULL OR cm.row_pg3 IS NOT NULL)
             THEN
               (CASE WHEN cm.row_pg1 IS NOT NULL THEN 1 ELSE 0 END
              + CASE WHEN cm.row_pg2 IS NOT NULL THEN 1 ELSE 0 END
              + CASE WHEN cm.row_pg3 IS NOT NULL THEN 1 ELSE 0 END)
        ELSE NULL
      END AS prod_prio
    FROM customer_matched cm
    WHERE cm.match_source IS NOT NULL
  ),
  effective AS (
    -- "Sær vinder altid": når saerpris_kr > 0, så er det DEN rabat der gælder
    -- for rækken (ignorer rab_kr / rab_pct på samme række).
    SELECT pm.*,
      (COALESCE(pm.saerpris_kr, 0) > 0) AS has_saer,
      CASE WHEN COALESCE(pm.saerpris_kr, 0) > 0
           THEN 0::numeric
           ELSE COALESCE(pm.rab_pct, 0) END AS eff_pct,
      CASE WHEN COALESCE(pm.saerpris_kr, 0) > 0
           THEN pm.saerpris_kr
           ELSE COALESCE(pm.rab_kr, 0) END AS eff_kr
    FROM product_matched pm
    WHERE pm.prod_prio IS NOT NULL
  ),
  usable AS (
    SELECT *
    FROM effective
    WHERE (eff_pct > 0 OR eff_kr > 0)
      AND eff_pct < 100
  )
  SELECT u.eff_pct,
         u.eff_kr,
         (u.match_source || '/' ||
           CASE u.prod_prio WHEN 4 THEN 'varenr' WHEN 3 THEN 'pg1+pg2+pg3'
                            WHEN 2 THEN 'pg2-grupper' ELSE 'pg-gruppe' END ||
           CASE WHEN u.has_saer THEN '/saerpris' ELSE '' END)::text AS kilde,
         u.has_saer AS er_saerpris
  FROM usable u
  ORDER BY u.cust_prio DESC, u.prod_prio DESC,
           u.has_saer DESC,
           u.eff_pct DESC, u.eff_kr DESC
  LIMIT 1;
END $function$;

REVOKE ALL ON FUNCTION public.get_quote_floor_discount(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_floor_discount(uuid, text) TO authenticated, service_role;
