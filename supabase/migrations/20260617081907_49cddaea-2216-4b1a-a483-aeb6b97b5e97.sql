
CREATE OR REPLACE FUNCTION public.get_quote_floor_discount(p_company_id uuid, p_varenr text)
 RETURNS TABLE(rabat_pct numeric, rabat_kr numeric, kilde text)
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
      -- WILDCARD-normalisering: "0" og tom = "gælder alle"
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
  usable AS (
    SELECT *
    FROM product_matched
    WHERE prod_prio IS NOT NULL
      AND (COALESCE(rab_pct,0) > 0 OR COALESCE(rab_kr,0) > 0)
      AND COALESCE(rab_pct,0) < 100
  )
  SELECT u.rab_pct, u.rab_kr,
         (u.match_source || '/' ||
           CASE u.prod_prio WHEN 4 THEN 'varenr' WHEN 3 THEN 'pg1+pg2+pg3'
                            WHEN 2 THEN 'pg2-grupper' ELSE 'pg-gruppe' END)::text AS kilde
  FROM usable u
  ORDER BY u.cust_prio DESC, u.prod_prio DESC,
           COALESCE(u.rab_pct,0) DESC, COALESCE(u.rab_kr,0) DESC
  LIMIT 1;
END $function$;
