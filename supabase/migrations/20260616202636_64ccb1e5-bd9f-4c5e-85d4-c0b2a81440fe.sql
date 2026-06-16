
-- 1) products: favorit
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_favorit boolean NOT NULL DEFAULT false;

-- 2) quotes: udvidelser
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS delivery_location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS public_token text NULL,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_pricing_mode_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_pricing_mode_check
  CHECK (pricing_mode IN ('purchase','lease','both'));

CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_unique
  ON public.quotes(public_token) WHERE public_token IS NOT NULL;

-- 3) quote_lines
CREATE TABLE IF NOT EXISTS public.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  varenr text NOT NULL,
  line_type text NOT NULL,
  beskrivelse_snapshot text,
  antal numeric NOT NULL DEFAULT 1,
  listepris_snapshot numeric NOT NULL DEFAULT 0,
  rabat_pct_snapshot numeric NOT NULL DEFAULT 0,
  rabat_kr_snapshot numeric NOT NULL DEFAULT 0,
  nettopris_snapshot numeric NOT NULL DEFAULT 0,
  er_leje boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_lines_line_type_check CHECK (line_type IN ('machine','accessory','consumable'))
);

CREATE INDEX IF NOT EXISTS quote_lines_quote_idx ON public.quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS quote_lines_varenr_idx ON public.quote_lines(varenr);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_lines TO authenticated;
GRANT ALL ON public.quote_lines TO service_role;

ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated kan læse quote_lines" ON public.quote_lines;
CREATE POLICY "Authenticated kan læse quote_lines" ON public.quote_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND public.can_access_company(auth.uid(), q.company_id)
    )
  );

DROP POLICY IF EXISTS "Authenticated kan oprette quote_lines" ON public.quote_lines;
CREATE POLICY "Authenticated kan oprette quote_lines" ON public.quote_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.frozen_at IS NULL
        AND public.can_access_company(auth.uid(), q.company_id)
    )
  );

DROP POLICY IF EXISTS "Authenticated kan opdatere quote_lines" ON public.quote_lines;
CREATE POLICY "Authenticated kan opdatere quote_lines" ON public.quote_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.frozen_at IS NULL
        AND public.can_access_company(auth.uid(), q.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.frozen_at IS NULL
        AND public.can_access_company(auth.uid(), q.company_id)
    )
  );

DROP POLICY IF EXISTS "Authenticated kan slette quote_lines" ON public.quote_lines;
CREATE POLICY "Authenticated kan slette quote_lines" ON public.quote_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_lines.quote_id
        AND q.frozen_at IS NULL
        AND public.can_access_company(auth.uid(), q.company_id)
    )
  );

DROP TRIGGER IF EXISTS touch_quote_lines ON public.quote_lines;
CREATE TRIGGER touch_quote_lines BEFORE UPDATE ON public.quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Trigger: blokér ændringer når frozen_at er sat
CREATE OR REPLACE FUNCTION public.prevent_frozen_quote_line_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_frozen timestamptz;
BEGIN
  SELECT frozen_at INTO v_frozen FROM public.quotes
    WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
  IF v_frozen IS NOT NULL THEN
    -- service_role må stadig (fx admin-fix)
    IF current_setting('request.jwt.claim.role', true) <> 'service_role'
       AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Tilbuddet er frosset og kan ikke ændres';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS guard_frozen_quote_lines ON public.quote_lines;
CREATE TRIGGER guard_frozen_quote_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_frozen_quote_line_change();

-- updated_at trigger på quotes
DROP TRIGGER IF EXISTS touch_quotes ON public.quotes;
CREATE TRIGGER touch_quotes BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) get_quote_floor_discount
-- Returnerer det rabat-gulv kunden har ret til på et givent varenr.
-- Matcher kundeside via 4-nøgle (kundenr / kp1+kp2 / kp1 / kp2) og produktside via
-- (varenr ELLER produktprisgruppe 1/2/3 hvor tom/0 betyder wildcard).
-- Filtrér på gyldighed (fra_dato <= today <= til_dato eller til_dato NULL).
-- Vælger den bedste rabat (højest pct, ellers højest kr).
CREATE OR REPLACE FUNCTION public.get_quote_floor_discount(
  p_company_id uuid,
  p_varenr text
)
RETURNS TABLE(rabat_pct numeric, rabat_kr numeric, kilde text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visma text;
  v_kp1 text;
  v_kp2 text;
  v_p_pg1 text;
  v_p_pg2 text;
  v_p_pg3 text;
BEGIN
  SELECT NULLIF(trim(visma_id), ''),
         NULLIF(substring(trim(customer_segment_1) from '^(\d+)'), ''),
         NULLIF(substring(trim(customer_segment_2) from '^(\d+)'), '')
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
      NULLIF(trim(ap.fak_kundenr), '') AS row_kundenr,
      NULLIF(NULLIF(substring(ap.kundeprisgruppe1 from '^(\d+)'), ''), '0') AS row_kp1,
      NULLIF(NULLIF(substring(ap.kundeprisgruppe2 from '^(\d+)'), ''), '0') AS row_kp2,
      NULLIF(trim(ap.varenr), '') AS row_varenr,
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
        WHEN v_visma IS NOT NULL AND s.row_kundenr = v_visma THEN 'kundenr'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NOT NULL AND s.row_kp2 IS NOT NULL
             AND s.row_kp1 = v_kp1 AND s.row_kp2 = v_kp2 THEN 'kp1+kp2'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NOT NULL AND s.row_kp2 IS NULL
             AND s.row_kp1 = v_kp1 THEN 'kp1'
        WHEN s.row_kundenr IS NULL AND s.row_kp1 IS NULL AND s.row_kp2 IS NOT NULL
             AND s.row_kp2 = v_kp2 THEN 'kp2'
        ELSE NULL
      END AS match_source,
      CASE
        WHEN v_visma IS NOT NULL AND s.row_kundenr = v_visma THEN 4
        WHEN s.row_kp1 = v_kp1 AND s.row_kp2 = v_kp2 THEN 3
        WHEN s.row_kp1 = v_kp1 THEN 2
        WHEN s.row_kp2 = v_kp2 THEN 1
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
END $$;

REVOKE ALL ON FUNCTION public.get_quote_floor_discount(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_floor_discount(uuid, text) TO authenticated, service_role;
