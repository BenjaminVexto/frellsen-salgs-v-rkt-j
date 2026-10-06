ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS kreditspaerret boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.companies.kreditspaerret IS 'Alle virksomhedens Aktør-lokationer er kreditspærrede. Tæller med i omsætning, men udelades af salgsmuligheder, Sælg mere og sovende-lister.';

CREATE TABLE public.companies_saelger_backup (
  backup_dato date NOT NULL,
  company_id uuid NOT NULL,
  assigned_to uuid,
  kreditspaerret boolean,
  PRIMARY KEY (backup_dato, company_id)
);
GRANT SELECT ON public.companies_saelger_backup TO authenticated;
GRANT ALL ON public.companies_saelger_backup TO service_role;
ALTER TABLE public.companies_saelger_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læser sælgerbackup" ON public.companies_saelger_backup FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
INSERT INTO public.companies_saelger_backup (backup_dato, company_id, assigned_to, kreditspaerret)
SELECT current_date, id, assigned_to, kreditspaerret FROM public.companies;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS saelger_no text,
  ADD COLUMN IF NOT EXISTS saelger_user_id uuid,
  ADD COLUMN IF NOT EXISTS kreditspaerret boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS i_aktoer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS er_hovedkonto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aktoer_opdateret timestamptz;
COMMENT ON COLUMN public.locations.saelger_no IS 'Sælgernr. fra Aktør-kolonnen "Sælger" for (afdeling, Lev. kund). NULL = ingen sælger i Visma.';
COMMENT ON COLUMN public.locations.saelger_user_id IS 'Bruger med profiles.salesperson_no = saelger_no (trigger). NULL med saelger_no = ukendt sælger.';
COMMENT ON COLUMN public.locations.kreditspaerret IS 'Aktør-kolonnen Kreditspærre er udfyldt.';
COMMENT ON COLUMN public.locations.i_aktoer IS 'Leveringsnr. findes i seneste Aktør-import for afdelingen. false = "Ikke i Aktør", tildeles ingen sælger.';
COMMENT ON COLUMN public.locations.er_hovedkonto IS 'Lev. kund = Fakt. kunde i seneste Aktør-import.';
CREATE INDEX IF NOT EXISTS idx_locations_saelger_user ON public.locations (saelger_user_id) WHERE saelger_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_afd_lev ON public.locations (afdeling_nr, visma_delivery_no);

CREATE OR REPLACE FUNCTION public.lok_saelger_noegle(_i_aktoer boolean, _user uuid, _no text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN NOT coalesce(_i_aktoer, false) THEN 'ikke_i_aktoer'
    WHEN _user IS NOT NULL THEN _user::text
    WHEN nullif(btrim(coalesce(_no, '')), '') IS NULL THEN 'ingen'
    ELSE 'ukendt:' || btrim(_no)
  END
$$;

CREATE OR REPLACE FUNCTION public.lok_saelger(_location_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT l.saelger_user_id FROM public.locations l WHERE l.id = _location_id AND l.i_aktoer
$$;

CREATE OR REPLACE FUNCTION public._lok_resolve_saelger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW.saelger_no, '')), '') IS NULL THEN
    NEW.saelger_user_id := NULL;
  ELSE
    SELECT p.id INTO NEW.saelger_user_id
    FROM public.profiles p
    WHERE btrim(p.salesperson_no) = btrim(NEW.saelger_no)
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lok_resolve_saelger
BEFORE INSERT OR UPDATE OF saelger_no ON public.locations
FOR EACH ROW EXECUTE FUNCTION public._lok_resolve_saelger();

CREATE OR REPLACE FUNCTION public._profil_saelgerno_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.locations l SET saelger_user_id = NULL
  WHERE l.saelger_user_id = NEW.id
    AND btrim(coalesce(l.saelger_no, '')) IS DISTINCT FROM btrim(coalesce(NEW.salesperson_no, ''));
  IF nullif(btrim(coalesce(NEW.salesperson_no, '')), '') IS NOT NULL THEN
    UPDATE public.locations l SET saelger_user_id = NEW.id
    WHERE btrim(l.saelger_no) = btrim(NEW.salesperson_no)
      AND l.saelger_user_id IS DISTINCT FROM NEW.id;
    UPDATE public.companies c SET assigned_to = NEW.id
    FROM public.locations l
    WHERE l.company_id = c.id AND l.er_hovedkonto AND l.i_aktoer
      AND btrim(l.saelger_no) = btrim(NEW.salesperson_no)
      AND c.assigned_to IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_profil_saelgerno_changed
AFTER INSERT OR UPDATE OF salesperson_no ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._profil_saelgerno_changed();

ALTER TABLE public.sales_kunde_maaned
  ADD COLUMN IF NOT EXISTS saelger_noegle text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_inv_any date,
  ADD COLUMN IF NOT EXISTS last_inv_fb date,
  ADD COLUMN IF NOT EXISTS last_inv_cons date;
COMMENT ON COLUMN public.sales_kunde_maaned.saelger IS 'Lokationens sælger (locations.saelger_user_id). NULL = ukendt sælger, ingen sælger eller ikke i Aktør — se saelger_noegle.';
COMMENT ON COLUMN public.sales_kunde_maaned.saelger_noegle IS 'lok_saelger_noegle(): bruger-id, ''ukendt:<nr>'', ''ingen'' eller ''ikke_i_aktoer''.';
UPDATE public.sales_kunde_maaned SET saelger_noegle = coalesce(saelger::text, 'ingen');
ALTER TABLE public.sales_kunde_maaned DROP CONSTRAINT sales_kunde_maaned_pkey;
ALTER TABLE public.sales_kunde_maaned ADD PRIMARY KEY (afdeling_nr, period, company_id, saelger_noegle);
CREATE INDEX IF NOT EXISTS idx_skm_saelger_period ON public.sales_kunde_maaned (saelger, period);

CREATE TABLE public.location_mp_info (
  location_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  afdeling_nr integer,
  foerste_ordre date
);
GRANT SELECT ON public.location_mp_info TO authenticated;
GRANT ALL ON public.location_mp_info TO service_role;
ALTER TABLE public.location_mp_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin kan læse lokationers første ordre" ON public.location_mp_info
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_lmi_company ON public.location_mp_info (company_id);

CREATE OR REPLACE FUNCTION public._skm_refresh_keys()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _fg text[] := public.maalepunkt_forbrug_grupper();
BEGIN
  DELETE FROM public.sales_kunde_maaned f
  USING (SELECT DISTINCT company_id, afdeling_nr, period FROM pg_temp._skm_keys) k
  WHERE f.company_id = k.company_id AND f.afdeling_nr = k.afdeling_nr AND f.period = k.period;

  INSERT INTO public.sales_kunde_maaned
    (company_id, afdeling_nr, period, saelger_noegle, rev, contrib, kg, rev_fg, contrib_fg, pos_fg, pos_any,
     rev_ex16, rev_c4, kg_c4, pos_c4, koder, has_fg, saelger, kat, c_afd, gyldig,
     last_inv_any, last_inv_fb, last_inv_cons)
  SELECT x.company_id, x.afdeling_nr, x.period, x.noegle,
         sum(x.rev), sum(x.contrib), sum(x.kg),
         coalesce(sum(x.rev) FILTER (WHERE x.pg1 = ANY (_fg)), 0),
         coalesce(sum(x.contrib) FILTER (WHERE x.pg1 = ANY (_fg)), 0),
         coalesce(bool_or(x.rev_raw > 0 AND x.kode = ANY (_fg)), false),
         coalesce(bool_or(x.rev_raw > 0), false),
         coalesce(sum(x.rev) FILTER (WHERE x.kode IS DISTINCT FROM '16'), 0),
         coalesce(sum(x.rev) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
         coalesce(sum(x.kg) FILTER (WHERE x.kode IN ('2','4','6','10')), 0),
         coalesce(bool_or(x.rev_raw > 0 AND x.kode IN ('2','4','6','10')), false),
         coalesce(array_agg(DISTINCT x.kode) FILTER (WHERE x.kode IS NOT NULL), '{}'),
         coalesce(bool_or(x.pg1 = ANY (_fg)), false),
         x.lsaelger,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3),
         c.afdeling_nr,
         coalesce(c.afloest_af_company_id IS NULL, false),
         max(x.inv) FILTER (WHERE x.akt),
         max(x.inv) FILTER (WHERE x.rev_raw > 0 AND x.kode = ANY (_fg)),
         max(x.inv) FILTER (WHERE x.akt AND public.is_consumable_group(x.pg1))
  FROM (
    SELECT sm.company_id, sm.afdeling_nr, sm.period, sm.product_group_1 AS pg1,
           sm.revenue AS rev_raw,
           coalesce(sm.revenue, 0)::numeric AS rev,
           coalesce(sm.contribution, 0)::numeric AS contrib,
           coalesce(sm.weight_kg, 0)::numeric AS kg,
           substring(btrim(coalesce(sm.product_group_1, '')) FROM '^(\d+)') AS kode,
           coalesce(sm.last_invoice_date, sm.period) AS inv,
           (coalesce(sm.revenue,0) > 0 OR coalesce(sm.quantity,0) > 0 OR coalesce(sm.order_count,0) > 0) AS akt,
           public.lok_saelger_noegle(l.i_aktoer, l.saelger_user_id, l.saelger_no) AS noegle,
           CASE WHEN l.i_aktoer THEN l.saelger_user_id END AS lsaelger
    FROM public.sales_monthly sm
    JOIN (SELECT DISTINCT company_id, afdeling_nr, period FROM pg_temp._skm_keys) k
      ON k.company_id = sm.company_id AND k.afdeling_nr = sm.afdeling_nr AND k.period = sm.period
    LEFT JOIN public.locations l ON l.id = sm.location_id
  ) x
  LEFT JOIN public.companies c ON c.id = x.company_id
  GROUP BY x.company_id, x.afdeling_nr, x.period, x.noegle, x.lsaelger,
           c.binding_status, c.customer_segment_3, c.afdeling_nr, c.afloest_af_company_id;

  DELETE FROM public.location_mp_info i
  USING (SELECT DISTINCT company_id FROM pg_temp._skm_keys) k WHERE i.company_id = k.company_id;
  INSERT INTO public.location_mp_info (location_id, company_id, afdeling_nr, foerste_ordre)
  SELECT sm.location_id, (array_agg(sm.company_id))[1], min(sm.afdeling_nr), min(sm.period) FILTER (WHERE sm.revenue > 0)
  FROM public.sales_monthly sm
  WHERE sm.location_id IS NOT NULL
    AND sm.company_id IN (SELECT DISTINCT company_id FROM pg_temp._skm_keys)
  GROUP BY sm.location_id
  ON CONFLICT (location_id) DO UPDATE SET company_id = EXCLUDED.company_id,
    afdeling_nr = EXCLUDED.afdeling_nr, foerste_ordre = EXCLUDED.foerste_ordre;

  DELETE FROM pg_temp._skm_keys;
END $$;
REVOKE EXECUTE ON FUNCTION public._skm_refresh_keys() FROM PUBLIC, anon, authenticated;

-- Samlet genberegning. _afdeling_nr = NULL: alt; ellers kun den afdeling (til opdeling under tidsgrænsen).
CREATE OR REPLACE FUNCTION public.skm_genberegn_alt(_afdeling_nr integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  DELETE FROM pg_temp._skm_keys;
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT company_id, afdeling_nr, period FROM public.sales_monthly
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL
      AND (_afdeling_nr IS NULL OR afdeling_nr = _afdeling_nr);
  IF _afdeling_nr IS NULL THEN
    TRUNCATE public.sales_kunde_maaned;
    TRUNCATE public.location_mp_info;
  END IF;
  PERFORM public._skm_refresh_keys();
  SELECT count(*) INTO n FROM public.sales_kunde_maaned WHERE _afdeling_nr IS NULL OR afdeling_nr = _afdeling_nr;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.skm_genberegn_alt(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skm_genberegn_alt(integer) TO service_role;

CREATE OR REPLACE FUNCTION public._skm_company_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.binding_status IS DISTINCT FROM NEW.binding_status
     OR OLD.customer_segment_3 IS DISTINCT FROM NEW.customer_segment_3
     OR OLD.afdeling_nr IS DISTINCT FROM NEW.afdeling_nr
     OR OLD.afloest_af_company_id IS DISTINCT FROM NEW.afloest_af_company_id THEN
    UPDATE public.sales_kunde_maaned f
    SET kat = public.maalepunkt_kundekategori(NEW.binding_status, NEW.customer_segment_3),
        c_afd = NEW.afdeling_nr,
        gyldig = (NEW.afloest_af_company_id IS NULL)
    WHERE f.company_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._skm_lok_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('app.skm_skip', true) = 'on' THEN RETURN NULL; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT sm.company_id, sm.afdeling_nr, sm.period
    FROM public.sales_monthly sm
    WHERE sm.location_id IN (
      SELECT n.id FROM new_rows n JOIN old_rows o ON o.id = n.id
      WHERE o.saelger_user_id IS DISTINCT FROM n.saelger_user_id
         OR o.saelger_no IS DISTINCT FROM n.saelger_no
         OR o.i_aktoer IS DISTINCT FROM n.i_aktoer)
      AND sm.company_id IS NOT NULL AND sm.afdeling_nr IS NOT NULL AND sm.period IS NOT NULL;
  IF EXISTS (SELECT 1 FROM pg_temp._skm_keys) THEN
    PERFORM public._skm_refresh_keys();
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_skm_lok_changed AFTER UPDATE ON public.locations
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public._skm_lok_changed();

CREATE OR REPLACE FUNCTION public._skm_trg_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('app.skm_skip', true) = 'on' THEN RETURN NULL; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT company_id, afdeling_nr, period FROM new_rows
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL;
  PERFORM public._skm_refresh_keys();
  RETURN NULL;
END $$;

-- Aktør-staging (kun server). Afdeling normaliseres via afdeling_alias (13->11, 23->21) før indsættelse.
CREATE TABLE public.aktoer_lokation_staging (
  batch uuid NOT NULL,
  afdeling_nr integer NOT NULL,
  lev_kund text NOT NULL,
  fakt_kunde text,
  saelger_no text,
  kreditspaerret boolean NOT NULL DEFAULT false,
  PRIMARY KEY (batch, afdeling_nr, lev_kund)
);
GRANT ALL ON public.aktoer_lokation_staging TO service_role;
ALTER TABLE public.aktoer_lokation_staging ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.aktoer_lokation_staging IS 'Aktør-rækker til aktoer_anvend_saelgere. afdeling_nr er allerede normaliseret via afdeling_alias (fx 23 -> 21).';

CREATE OR REPLACE FUNCTION public.aktoer_anvend_saelgere(_batch uuid, _fuldt_udtraek boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _lok int; _ikke int; _comp int; _afd int[];
BEGIN
  SELECT array_agg(DISTINCT afdeling_nr) INTO _afd FROM public.aktoer_lokation_staging WHERE batch = _batch;
  IF _afd IS NULL THEN RETURN jsonb_build_object('lokationer', 0, 'ikke_i_aktoer', 0, 'virksomheder', 0); END IF;
  PERFORM set_config('app.skm_skip', 'on', true);

  UPDATE public.locations l
  SET saelger_no = nullif(btrim(coalesce(s.saelger_no, '')), ''),
      kreditspaerret = s.kreditspaerret,
      i_aktoer = true,
      er_hovedkonto = (s.lev_kund = s.fakt_kunde),
      aktoer_opdateret = now()
  FROM public.aktoer_lokation_staging s
  WHERE s.batch = _batch AND l.afdeling_nr = s.afdeling_nr AND l.visma_delivery_no = s.lev_kund
    AND (l.saelger_no IS DISTINCT FROM nullif(btrim(coalesce(s.saelger_no, '')), '')
      OR l.kreditspaerret IS DISTINCT FROM s.kreditspaerret OR NOT l.i_aktoer
      OR l.er_hovedkonto IS DISTINCT FROM (s.lev_kund = s.fakt_kunde));
  GET DIAGNOSTICS _lok = ROW_COUNT;

  _ikke := 0;
  IF _fuldt_udtraek THEN
    UPDATE public.locations l SET i_aktoer = false, er_hovedkonto = false, aktoer_opdateret = now()
    WHERE l.afdeling_nr = ANY (_afd) AND l.i_aktoer
      AND NOT EXISTS (SELECT 1 FROM public.aktoer_lokation_staging s
                      WHERE s.batch = _batch AND s.afdeling_nr = l.afdeling_nr AND s.lev_kund = l.visma_delivery_no);
    GET DIAGNOSTICS _ikke = ROW_COUNT;
  END IF;

  WITH berort AS (
    SELECT DISTINCT l.company_id FROM public.locations l
    WHERE l.afdeling_nr = ANY (_afd) AND l.company_id IS NOT NULL AND l.i_aktoer
  ), hoved AS (
    SELECT DISTINCT ON (l.company_id) l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.er_hovedkonto AND l.i_aktoer AND l.company_id IN (SELECT company_id FROM berort)
    ORDER BY l.company_id, l.created_at
  ), lokoms AS (
    SELECT DISTINCT ON (l.company_id) l.company_id, l.saelger_user_id AS saelger
    FROM public.sales_monthly sm JOIN public.locations l ON l.id = sm.location_id
    WHERE l.i_aktoer AND l.saelger_user_id IS NOT NULL
      AND sm.period >= (date_trunc('month', current_date) - interval '12 months')::date
      AND l.company_id IN (SELECT company_id FROM berort)
    GROUP BY l.company_id, l.saelger_user_id
    HAVING sum(sm.revenue) > 0
    ORDER BY l.company_id, sum(sm.revenue) DESC
  ), ny AS (
    SELECT b.company_id,
           CASE WHEN h.company_id IS NOT NULL THEN h.saelger_user_id ELSE lo.saelger END AS saelger,
           NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = b.company_id AND l.i_aktoer AND NOT l.kreditspaerret) AS spaerret
    FROM berort b
    LEFT JOIN hoved h ON h.company_id = b.company_id
    LEFT JOIN lokoms lo ON lo.company_id = b.company_id
  )
  UPDATE public.companies c
  SET assigned_to = ny.saelger, kreditspaerret = ny.spaerret
  FROM ny
  WHERE c.id = ny.company_id
    AND (c.assigned_to IS DISTINCT FROM ny.saelger OR c.kreditspaerret IS DISTINCT FROM ny.spaerret);
  GET DIAGNOSTICS _comp = ROW_COUNT;

  DELETE FROM public.aktoer_lokation_staging WHERE batch = _batch;
  PERFORM set_config('app.skm_skip', 'off', true);

  RETURN jsonb_build_object('lokationer', _lok, 'ikke_i_aktoer', _ikke, 'virksomheder', _comp, 'afdelinger', to_jsonb(_afd));
END $$;
REVOKE EXECUTE ON FUNCTION public.aktoer_anvend_saelgere(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aktoer_anvend_saelgere(uuid, boolean) TO service_role;

CREATE TABLE public.bonus_laas (
  user_id uuid NOT NULL,
  maaned date NOT NULL,
  ordning_id uuid,
  db_grundlag numeric, db_provision_pct numeric, db_bonus numeric,
  antal_wittenborg numeric, antal_animo numeric, antal_rex numeric,
  maskinbonus numeric, samlet_bonus numeric,
  laast_af uuid,
  laast_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, maaned)
);
GRANT SELECT, INSERT, DELETE ON public.bonus_laas TO authenticated;
GRANT ALL ON public.bonus_laas TO service_role;
ALTER TABLE public.bonus_laas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin og egen sælger læser bonuslåse" ON public.bonus_laas FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Admin låser bonus" ON public.bonus_laas FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin låser bonus op" ON public.bonus_laas FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
COMMENT ON TABLE public.bonus_laas IS 'Fastfrosne bonusmåneder. bonus_pr_maaned returnerer det gemte resultat for låste måneder.';
