-- ============ 1. can_access_company: afdeling som EKSTRA betingelse ============
CREATE OR REPLACE FUNCTION public.can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND _company_id IS NOT NULL
    -- NY: virksomhedens afdeling skal være blandt brugerens afdelinger
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = _company_id
        AND c.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
    )
    -- UÆNDRET rolle-/tildelingslogik
    AND (
      public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'salgssupport')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = _company_id
          AND c.assigned_to = _user_id
      )
    )
$function$;

-- ============ 2. companies ============
DROP POLICY "Alle autentificerede ser virksomheder" ON public.companies;
CREATE POLICY "Alle autentificerede ser virksomheder" ON public.companies
  FOR SELECT TO authenticated
  USING (afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Autentificerede opretter virksomheder" ON public.companies;
CREATE POLICY "Autentificerede opretter virksomheder" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Opdater virksomheder med adgang" ON public.companies;
CREATE POLICY "Opdater virksomheder med adgang" ON public.companies
  FOR UPDATE TO authenticated
  USING ((public.can_access_company(auth.uid(), id) OR public.is_admin(auth.uid()))
         AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]))
  WITH CHECK ((public.can_access_company(auth.uid(), id) OR public.is_admin(auth.uid()))
         AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Admin sletter virksomheder" ON public.companies;
CREATE POLICY "Admin sletter virksomheder" ON public.companies
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

-- ============ 3. locations ============
DROP POLICY "Alle indloggede brugere kan se lokationer" ON public.locations;
CREATE POLICY "Alle indloggede brugere kan se lokationer" ON public.locations
  FOR SELECT TO authenticated
  USING (afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Opret lokationer for tilgængelige virksomheder" ON public.locations;
CREATE POLICY "Opret lokationer for tilgængelige virksomheder" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
         AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Opdater lokationer for tilgængelige virksomheder" ON public.locations;
CREATE POLICY "Opdater lokationer for tilgængelige virksomheder" ON public.locations
  FOR UPDATE TO authenticated
  USING ((public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
         AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]))
  WITH CHECK ((public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
         AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Admin sletter lokationer" ON public.locations;
CREATE POLICY "Admin sletter lokationer" ON public.locations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

-- ============ 4. machines ============
DROP POLICY "Authenticated can read machines" ON public.machines;
CREATE POLICY "Authenticated can read machines" ON public.machines
  FOR SELECT TO authenticated
  USING (afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Admins manage machines" ON public.machines;
CREATE POLICY "Admins manage machines" ON public.machines
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]))
  WITH CHECK (public.is_admin(auth.uid()) AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

-- ============ 5. agreement_pricing ============
DROP POLICY "Authenticated users can read pricing" ON public.agreement_pricing;
CREATE POLICY "Authenticated users can read pricing" ON public.agreement_pricing
  FOR SELECT TO authenticated
  USING (afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

DROP POLICY "Admins manage pricing" ON public.agreement_pricing;
CREATE POLICY "Admins manage pricing" ON public.agreement_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[]));

-- ============ 6. sales-tabellernes NULL-huller ============
DROP POLICY "Users can view accessible sales_monthly" ON public.sales_monthly;
CREATE POLICY "Users can view accessible sales_monthly" ON public.sales_monthly
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN company_id IS NULL THEN afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
      ELSE public.can_access_company(auth.uid(), company_id)
    END
  );

DROP POLICY "Users can view accessible sales_monthly_products" ON public.sales_monthly_products;
CREATE POLICY "Users can view accessible sales_monthly_products" ON public.sales_monthly_products
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN location_id IS NULL THEN
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'))
        AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
      ELSE EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = sales_monthly_products.location_id
          AND l.company_id IS NOT NULL
          AND public.can_access_company(auth.uid(), l.company_id)
      )
    END
  );

DROP POLICY "Users can view accessible sales_top_products" ON public.sales_top_products;
CREATE POLICY "Users can view accessible sales_top_products" ON public.sales_top_products
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN location_id IS NULL THEN afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
      ELSE EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.id = sales_top_products.location_id
          AND CASE
                WHEN l.company_id IS NULL
                  THEN sales_top_products.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
                ELSE public.can_access_company(auth.uid(), l.company_id)
              END
      )
    END
  );

-- ============ 7. Kategori A: get_quote_floor_discount ============
CREATE OR REPLACE FUNCTION public.get_quote_floor_discount(p_company_id uuid, p_varenr text)
 RETURNS TABLE(rabat_pct numeric, rabat_kr numeric, saerpris_kr numeric, kilde text, er_saerpris boolean)
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
  v_afd int[];
BEGIN
  v_afd := public.my_afdelinger();

  -- NY: virksomheden skal ligge i en afdeling kalderen har adgang til
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id AND c.afdeling_nr = ANY (v_afd)
  ) THEN
    RETURN;
  END IF;

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
      AND ap.afdeling_nr = ANY (v_afd)   -- NY
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
    SELECT pm.*,
      COALESCE(pm.rab_pct, 0)     AS eff_pct,
      COALESCE(pm.rab_kr, 0)      AS eff_kr,
      COALESCE(pm.saerpris_kr, 0) AS eff_saer
    FROM product_matched pm
    WHERE pm.prod_prio IS NOT NULL
      AND (COALESCE(pm.rab_pct, 0) > 0
           OR COALESCE(pm.rab_kr, 0) > 0
           OR COALESCE(pm.saerpris_kr, 0) > 0)
      AND COALESCE(pm.rab_pct, 0) < 100
  )
  SELECT u.eff_pct,
         u.eff_kr,
         u.eff_saer,
         (u.match_source || '/' ||
           CASE u.prod_prio WHEN 4 THEN 'varenr' WHEN 3 THEN 'pg1+pg2+pg3'
                            WHEN 2 THEN 'pg2-grupper' ELSE 'pg-gruppe' END ||
           CASE WHEN u.eff_saer > 0 THEN '/saerpris' ELSE '' END)::text AS kilde,
         (u.eff_saer > 0) AS er_saerpris
  FROM usable u
  ORDER BY u.cust_prio DESC,
           u.prod_prio DESC,
           (u.eff_pct + u.eff_kr + u.eff_saer) DESC,
           u.eff_pct DESC, u.eff_kr DESC, u.eff_saer DESC
  LIMIT 1;
END $function$;

-- ============ 8. Kategori B: kun service_role må kalde vedligeholdelses-RPC'er ============
REVOKE ALL ON FUNCTION public.rebuild_products()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_all_company_statuses()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_company_status(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_company_statuses_batch(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_visma_product_master(jsonb)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_primary_location(uuid, text)         FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rebuild_products()                       TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_all_company_statuses()         TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_company_status(uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_company_statuses_batch(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_visma_product_master(jsonb)       TO service_role;
GRANT EXECUTE ON FUNCTION public.set_primary_location(uuid, text)         TO service_role;