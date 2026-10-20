-- Nye maskinbonusregler (besluttet 20/10-2026)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_bonusklasse_check;
ALTER TABLE public.products ADD CONSTRAINT products_bonusklasse_check
  CHECK (bonusklasse IS NULL OR bonusklasse = ANY (ARRAY['wittenborg','animo','rex','kalerm','espresso','ingen']));

ALTER TABLE public.bonus_ordning
  ADD COLUMN IF NOT EXISTS bonus_kalerm numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS bonus_espresso numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS bonus_brugt numeric NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS ombytning_mdr integer NOT NULL DEFAULT 24;
COMMENT ON COLUMN public.bonus_ordning.overtagelse_mdr IS 'DEPRECATED: erstattet af reglen "samme maskine hos samme kunde" uden tidsgrænse (20/10-2026)';

CREATE TABLE public.bonus_maskin_vurdering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  maaned date NOT NULL,
  serienr text NOT NULL,
  godkendt boolean,
  ny_brugt text CHECK (ny_brugt IS NULL OR ny_brugt IN ('ny','brugt')),
  aarsag text,
  tjekliste jsonb NOT NULL DEFAULT '{}'::jsonb,
  besluttet_af uuid DEFAULT auth.uid(),
  besluttet_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, maaned, serienr)
);
CREATE TABLE public.bonus_maskin_vurdering_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  maaned date NOT NULL,
  serienr text NOT NULL,
  handling text NOT NULL,
  godkendt boolean,
  ny_brugt text,
  aarsag text,
  tjekliste jsonb,
  udfoert_af uuid,
  udfoert_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_maskin_vurdering TO authenticated;
GRANT ALL ON public.bonus_maskin_vurdering TO service_role;
GRANT SELECT ON public.bonus_maskin_vurdering_log TO authenticated;
GRANT ALL ON public.bonus_maskin_vurdering_log TO service_role;
GRANT USAGE ON SEQUENCE public.bonus_maskin_vurdering_log_id_seq TO service_role;
ALTER TABLE public.bonus_maskin_vurdering ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_maskin_vurdering_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin og egen læser vurderinger" ON public.bonus_maskin_vurdering FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Admin opretter vurderinger" ON public.bonus_maskin_vurdering FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin retter vurderinger" ON public.bonus_maskin_vurdering FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin sletter vurderinger" ON public.bonus_maskin_vurdering FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.bonus_maskin_vurdering AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY "Admin læser vurderingslog" ON public.bonus_maskin_vurdering_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.bonus_maskin_vurdering_log AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE OR REPLACE FUNCTION public._bonus_maskin_vurdering_vagt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.bonus_maskin_vurdering;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (SELECT 1 FROM public.bonus_laas l WHERE l.maaned = date_trunc('month', r.maaned)::date AND l.user_id = r.user_id) THEN
    RAISE EXCEPTION 'Måneden er låst – vurderinger kan ikke ændres. Brug efterregulering.';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    NEW.maaned := date_trunc('month', NEW.maaned)::date;
    NEW.besluttet_af := auth.uid();
    NEW.besluttet_at := now();
  END IF;
  INSERT INTO public.bonus_maskin_vurdering_log (user_id, maaned, serienr, handling, godkendt, ny_brugt, aarsag, tjekliste, udfoert_af)
  VALUES (r.user_id, date_trunc('month', r.maaned)::date, r.serienr, lower(TG_OP),
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.godkendt END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.ny_brugt END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.aarsag END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.tjekliste END, auth.uid());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER bonus_maskin_vurdering_vagt BEFORE INSERT OR UPDATE OR DELETE ON public.bonus_maskin_vurdering
  FOR EACH ROW EXECUTE FUNCTION public._bonus_maskin_vurdering_vagt();

CREATE OR REPLACE FUNCTION public.maskin_bonusklasse(_type text, _maaned date)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(_type, '')), '') IS NULL THEN NULL
    WHEN _type ~* 'optivend' THEN 'ingen'
    WHEN _type ~* 'kalerm' THEN 'kalerm'
    WHEN _type ~* 'profitec|espresso' THEN 'espresso'
    WHEN _type ~* 'animo|optibean|optime' THEN 'animo'
    WHEN _type ~* 'rex' THEN 'rex'
    WHEN _type ~* '^gaggia g300|wittenborg|^(w100|95|9100|9000)' THEN 'wittenborg'
    ELSE 'ingen'
  END
$$;

DROP FUNCTION IF EXISTS public.bonus_maskin_detaljer(uuid, date, date);
DROP FUNCTION IF EXISTS public.bonus_pr_maaned(uuid, date, date);
DROP FUNCTION IF EXISTS public.bonus_maskin_grundlag(uuid, date, date);

CREATE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text,
   model text, antal numeric, faktura_dato date, beloeb numeric, serienr text, bonusklasse text, udeladt boolean, aarsag text,
   status text, vurdering text, brugt_kilde text, forgaenger_serienr text, forgaenger_dato date,
   godkendt boolean, lev_kundenr text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH ordning AS (
    SELECT coalesce(max(b.ombytning_mdr), 24) AS mdr
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _til)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
  ),
  loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no) l.visma_delivery_no, l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  sn_ordre AS (
    SELECT DISTINCT btrim(split_part(il.varetekst, ':', 2)) AS serienr, il.ordre_nr, il.afdeling_nr
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16' AND il.varegruppe_2 = '83'
      AND il.varetekst ILIKE 'serienr%' AND btrim(split_part(il.varetekst, ':', 2)) <> ''
      AND il.ordre_nr IS NOT NULL
  ),
  vare AS (
    SELECT DISTINCT ON (s.serienr) s.serienr, il.varenr, coalesce(il.varetekst, '') AS varetekst,
           coalesce(il.beloeb, 0) AS beloeb
    FROM sn_ordre s
    JOIN public.invoice_lines il ON il.ordre_nr = s.ordre_nr AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16' AND il.varegruppe_2 IN ('78','84','80')
    ORDER BY s.serienr, (coalesce(il.antal, 0) > 0) DESC, il.faktura_dato DESC
  ),
  brugt_tekst AS (
    SELECT DISTINCT s.serienr
    FROM sn_ordre s
    JOIN public.invoice_lines il ON il.ordre_nr = s.ordre_nr AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16' AND il.varegruppe_2 IN ('78','84','80')
    WHERE il.varetekst ILIKE '%brugt%'
  ),
  mtype AS (
    SELECT DISTINCT ON (h.serienr) h.serienr, h.maskin_type
    FROM public.maskin_haendelser h
    WHERE h.serienr IS NOT NULL AND nullif(btrim(h.maskin_type), '') IS NOT NULL
    ORDER BY h.serienr, h.import_tid DESC
  ),
  leje_hist AS (
    SELECT s.serienr, l.company_id, il.visma_delivery_no AS lev_kundenr, il.faktura_dato AS dato
    FROM sn_ordre s
    JOIN public.invoice_lines il ON il.ordre_nr = s.ordre_nr AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16' AND il.varegruppe_2 = '80'
    LEFT JOIN loc l ON l.visma_delivery_no = il.visma_delivery_no
    WHERE il.faktura_dato IS NOT NULL
  ),
  enheder AS (
    SELECT h.serienr, h.lev_kundenr, h.company_id, h.kobt_dato, h.lease_leje_dato, h.maskin_type
    FROM public.maskin_haendelser h WHERE h.serienr IS NOT NULL
    UNION ALL
    SELECT m.serienr, m.lev_kundenr, NULL::uuid, m.kobt_dato, m.lease_leje_dato, NULL::text
    FROM public.machines m WHERE m.serienr IS NOT NULL AND m.afdeling_nr = 11
  ),
  ev_raa AS (
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'salg'::text AS kilde, e.kobt_dato AS dato, e.maskin_type
    FROM enheder e WHERE e.kobt_dato IS NOT NULL
    UNION ALL
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'leje'::text, e.lease_leje_dato, e.maskin_type
    FROM enheder e WHERE e.lease_leje_dato IS NOT NULL
  ),
  ev AS (
    SELECT DISTINCT ON (r.serienr, date_trunc('month', r.dato))
           date_trunc('month', r.dato)::date AS maaned,
           r.serienr, r.lev_kundenr, r.company_id, r.kilde, r.dato, r.maskin_type
    FROM ev_raa r
    WHERE r.dato >= date_trunc('month', _fra)::date
      AND r.dato < (date_trunc('month', _til) + interval '1 month')::date
      AND r.dato < date_trunc('month', current_date)::date
    ORDER BY r.serienr, date_trunc('month', r.dato),
             CASE WHEN r.kilde = 'salg' THEN 0 ELSE 1 END, (r.maskin_type IS NULL), r.dato
  ),
  med_kunde AS (
    SELECT ev.*, coalesce(ev.company_id, l.company_id) AS cid,
           (l.visma_delivery_no IS NOT NULL) AS har_lok, l.saelger_user_id AS lok_saelger
    FROM ev LEFT JOIN loc l ON l.visma_delivery_no = ev.lev_kundenr
  ),
  sn_net AS (
    SELECT btrim(split_part(il.varetekst, ':', 2)) AS serienr, il.ordre_nr,
           sum(il.antal) AS net, min(il.faktura_dato) FILTER (WHERE il.antal > 0) AS fdato
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_2 = '83' AND il.varetekst ILIKE 'serienr%'
      AND il.ordre_nr IS NOT NULL
      AND btrim(split_part(il.varetekst, ':', 2)) IN (SELECT mk.serienr FROM med_kunde mk)
    GROUP BY 1, 2
  ),
  lev_ordre AS (
    SELECT DISTINCT ON (mk.serienr, mk.maaned) mk.serienr, mk.maaned, s.ordre_nr
    FROM med_kunde mk
    JOIN sn_net s ON s.serienr = mk.serienr AND s.net > 0 AND s.fdato IS NOT NULL
    WHERE s.fdato BETWEEN mk.dato - 60 AND mk.dato + 60
    ORDER BY mk.serienr, mk.maaned, abs(s.fdato - mk.dato)
  ),
  retur AS (
    SELECT x.ordre_nr, sum(x.nb) AS retur_beloeb
    FROM (
      SELECT il.ordre_nr, il.varenr, sum(il.antal) AS na, sum(il.beloeb) AS nb
      FROM public.invoice_lines il
      WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16' AND il.varegruppe_2 IN ('78','80','84')
        AND il.ordre_nr IN (SELECT lo.ordre_nr FROM lev_ordre lo)
        AND NOT public.maskin_er_tilvalg(il.varetekst)
        AND coalesce(il.varetekst, '') !~* 'brita|kit|filter|beholder|mælk|bordplade|flowjet|pumpe|grums|vitrifrigo'
      GROUP BY 1, 2
    ) x
    WHERE x.na < 0
    GROUP BY 1
  ),
  retur_maskiner AS (
    SELECT DISTINCT m.serienr, m.lev_kundenr
    FROM public.machines m
    WHERE m.afdeling_nr = 11 AND m.record_status <> 'aktiv' AND m.serienr IS NOT NULL AND m.lev_kundenr IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.machines a WHERE a.serienr = m.serienr AND a.lev_kundenr = m.lev_kundenr AND a.record_status = 'aktiv')
  ),
  beriget AS (
    SELECT mk.maaned, mk.serienr, mk.lev_kundenr, mk.kilde, mk.dato, mk.cid, c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(mk.maskin_type, mt.maskin_type) AS mtype,
           v.varenr, v.varetekst, v.beloeb,
           CASE WHEN p.bonusklasse_manuel THEN p.bonusklasse
                ELSE coalesce(public.maskin_bonusklasse(coalesce(mk.maskin_type, mt.maskin_type), mk.maaned), p.bonusklasse) END AS bonusklasse,
           (EXISTS (
             SELECT 1 FROM ev_raa r2
             WHERE r2.serienr = mk.serienr AND r2.dato < mk.dato
               AND (r2.lev_kundenr = mk.lev_kundenr OR r2.company_id = c.id))
            OR EXISTS (
             SELECT 1 FROM leje_hist lh
             WHERE lh.serienr = mk.serienr AND lh.dato < date_trunc('month', mk.dato)::date
               AND (lh.lev_kundenr = mk.lev_kundenr OR lh.company_id = c.id))) AS samme_kunde,
           (bt.serienr IS NOT NULL) AS brugt_tekst,
           (EXISTS (
             SELECT 1 FROM ev_raa r2
             WHERE r2.serienr = mk.serienr AND r2.dato < mk.dato
               AND r2.lev_kundenr IS DISTINCT FROM mk.lev_kundenr
               AND (r2.company_id IS NULL OR r2.company_id <> c.id))
            OR EXISTS (
             SELECT 1 FROM leje_hist lh
             WHERE lh.serienr = mk.serienr AND lh.dato < date_trunc('month', mk.dato)::date
               AND lh.lev_kundenr IS DISTINCT FROM mk.lev_kundenr
               AND (lh.company_id IS NULL OR lh.company_id <> c.id))) AS brugt_anden,
           coalesce(r.retur_beloeb, 0) AS retur_beloeb,
           (r.ordre_nr IS NOT NULL) AS retur_paa_ordre,
           fg.serienr AS fg_serienr, fg.dato AS fg_dato
    FROM med_kunde mk
    JOIN public.companies c ON c.id = mk.cid
    LEFT JOIN mtype mt ON mt.serienr = mk.serienr
    LEFT JOIN vare v ON v.serienr = mk.serienr
    LEFT JOIN public.products p ON p.varenr = v.varenr
    LEFT JOIN brugt_tekst bt ON bt.serienr = mk.serienr
    LEFT JOIN lev_ordre lo ON lo.serienr = mk.serienr AND lo.maaned = mk.maaned
    LEFT JOIN retur r ON r.ordre_nr = lo.ordre_nr
    LEFT JOIN LATERAL (
      SELECT r3.serienr, max(r3.dato) AS dato
      FROM ev_raa r3
      JOIN retur_maskiner rm ON rm.serienr = r3.serienr AND rm.lev_kundenr = r3.lev_kundenr
      LEFT JOIN mtype mt3 ON mt3.serienr = r3.serienr
      WHERE r3.lev_kundenr = mk.lev_kundenr AND r3.serienr <> mk.serienr AND r3.dato < mk.dato
        AND public.maskin_bonusklasse(coalesce(r3.maskin_type, mt3.maskin_type), mk.maaned) IN ('wittenborg','animo','rex','kalerm','espresso')
      GROUP BY r3.serienr
      ORDER BY max(r3.dato) DESC
      LIMIT 1
    ) fg ON true
    WHERE (CASE WHEN mk.har_lok THEN mk.lok_saelger ELSE c.assigned_to END) = _saelger AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ),
  vurderet AS (
    SELECT b.*, vu.godkendt, vu.ny_brugt, vu.aarsag AS vu_aarsag,
           CASE
             WHEN b.fg_serienr IS NOT NULL AND b.fg_dato > (b.dato - (o.mdr || ' months')::interval)::date THEN 'ombytning'
             WHEN b.fg_serienr IS NOT NULL THEN 'opgradering'
             WHEN b.retur_paa_ordre THEN 'ombytning'
             ELSE NULL
           END AS vurdering,
           CASE
             WHEN vu.ny_brugt = 'brugt' THEN 'admin'
             WHEN vu.ny_brugt = 'ny' THEN NULL
             WHEN b.brugt_tekst THEN 'tekst'
             WHEN b.brugt_anden THEN 'anden_kunde'
             ELSE NULL
           END AS brugt_kilde
    FROM beriget b
    CROSS JOIN ordning o
    LEFT JOIN public.bonus_maskin_vurdering vu
      ON vu.user_id = _saelger AND vu.maaned = b.maaned AND vu.serienr = b.serienr
  ),
  status AS (
    SELECT v.*,
      CASE
        WHEN v.bonusklasse IS NULL THEN 'vurdering'
        WHEN v.bonusklasse = 'ingen' THEN 'ingen'
        WHEN v.samme_kunde THEN 'ingen'
        WHEN v.godkendt IS FALSE THEN 'ingen'
        WHEN v.vurdering IS NOT NULL AND v.godkendt IS NOT TRUE THEN 'vurdering'
        ELSE 'bonus'
      END AS st
    FROM vurderet v
  )
  SELECT s.maaned, s.cid, s.name, s.city, s.kategori,
         CASE s.bonusklasse WHEN 'wittenborg' THEN 'Wittenborg' WHEN 'animo' THEN 'Animo'
           WHEN 'rex' THEN 'Rex-Royal' WHEN 'kalerm' THEN 'Kalerm' WHEN 'espresso' THEN 'Espresso'
           WHEN 'ingen' THEN 'Andet' ELSE 'Ukendt' END AS maerke,
         (s.brugt_kilde IS NOT NULL) AS brugt,
         s.kilde,
         coalesce(nullif(s.mtype, ''), nullif(s.varetekst, ''), s.serienr) AS model,
         1::numeric AS antal,
         s.dato AS faktura_dato,
         round(coalesce(s.beloeb, 0), 2) AS beloeb,
         s.serienr,
         s.bonusklasse,
         (s.st <> 'bonus') AS udeladt,
         CASE
           WHEN s.bonusklasse IS NULL THEN 'Maskintypen er ikke klassificeret endnu'
           WHEN s.bonusklasse = 'ingen' THEN 'Maskintypen giver ikke bonus'
           WHEN s.samme_kunde THEN 'Samme maskine hos samme kunde'
           WHEN s.godkendt IS FALSE THEN coalesce(nullif(s.vu_aarsag, ''), 'Afvist ved vurdering')
           WHEN s.vurdering = 'ombytning' AND s.godkendt IS NOT TRUE THEN 'Mulig ombytning — kræver vurdering'
           WHEN s.vurdering = 'opgradering' AND s.godkendt IS NOT TRUE THEN 'Opgradering — kontrollér'
           ELSE NULL
         END AS aarsag,
         s.st AS status,
         s.vurdering,
         s.brugt_kilde,
         s.fg_serienr,
         s.fg_dato,
         s.godkendt,
         s.lev_kundenr
  FROM status s
$function$;

CREATE FUNCTION public.bonus_maskin_detaljer(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(company_id uuid, navn text, by text, model text, maerke text, kilde text, brugt boolean, antal numeric,
   faktura_dato date, beloeb numeric, serienr text, bonusklasse text, udeladt boolean, aarsag text,
   status text, vurdering text, brugt_kilde text, forgaenger_serienr text, forgaenger_dato date, godkendt boolean,
   sats numeric, maaned date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH g AS (SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til))
  SELECT g.company_id, g.navn, g.by, g.model, g.maerke, g.kilde, g.brugt,
         g.antal, g.faktura_dato, g.beloeb, g.serienr, g.bonusklasse,
         g.udeladt, g.aarsag, g.status, g.vurdering, g.brugt_kilde, g.forgaenger_serienr, g.forgaenger_dato, g.godkendt,
         CASE WHEN g.status <> 'bonus' THEN 0::numeric
              WHEN g.brugt THEN coalesce(o.bonus_brugt, 0)
              ELSE CASE g.bonusklasse WHEN 'wittenborg' THEN coalesce(o.bonus_wittenborg, 0)
                     WHEN 'animo' THEN coalesce(o.bonus_animo, 0) WHEN 'rex' THEN coalesce(o.bonus_rex, 0)
                     WHEN 'kalerm' THEN coalesce(o.bonus_kalerm, 0) WHEN 'espresso' THEN coalesce(o.bonus_espresso, 0)
                     ELSE 0 END
         END AS sats,
         g.maaned
  FROM g
  LEFT JOIN LATERAL (
    SELECT b.* FROM public.bonus_ordning b
    WHERE b.user_id = _saelger AND b.gyldig_fra <= g.maaned
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= g.maaned)
    ORDER BY b.gyldig_fra DESC LIMIT 1
  ) o ON true
  WHERE ((g.kategori = 'privat' AND coalesce(o.maskin_privat, false))
      OR (g.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
    AND ((g.kilde = 'salg' AND coalesce(o.maskin_salg, false))
      OR (g.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
    AND (NOT g.brugt OR coalesce(o.maskin_brugt, false))
  ORDER BY g.faktura_dato;
END;
$function$;

CREATE FUNCTION public.bonus_pr_maaned(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric, db_bonus numeric,
   antal_wittenborg numeric, antal_animo numeric, antal_rex numeric, maskinbonus numeric, ny_kunde_db numeric,
   ny_kunde_rang integer, ny_kunde_bonus numeric, samlet_bonus numeric,
   antal_kalerm numeric, antal_espresso numeric, antal_brugt numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT g::date AS maaned
    FROM generate_series(date_trunc('month', _fra), date_trunc('month', _til), interval '1 month') g
    WHERE g::date < date_trunc('month', current_date)::date
  ),
  o AS (
    SELECT m.maaned, b.* FROM m
    LEFT JOIN public.bonus_ordning b ON b.user_id = _saelger AND b.gyldig_fra <= m.maaned
     AND (b.gyldig_til IS NULL OR b.gyldig_til >= m.maaned)
  ),
  db AS (
    SELECT f.period AS maaned, f.kat AS kategori, sum(f.contrib) AS vaerdi
    FROM public.sales_kunde_maaned f
    WHERE f.afdeling_nr = 11
      AND f.period >= date_trunc('month', _fra)::date AND f.period <= date_trunc('month', _til)::date
      AND f.period < date_trunc('month', current_date)::date
      AND f.saelger = _saelger AND f.gyldig AND f.kat IS NOT NULL
    GROUP BY 1, 2
  ),
  db_pr AS (
    SELECT o.maaned, coalesce(sum(db.vaerdi), 0) AS grundlag
    FROM o LEFT JOIN db ON db.maaned = o.maaned
      AND ((db.kategori = 'privat' AND coalesce(o.db_privat, false))
        OR (db.kategori = 'offentlig' AND coalesce(o.db_offentlig, false)))
    GROUP BY o.maaned
  ),
  mask AS (SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til)),
  mask_pr AS (
    SELECT o.maaned,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'wittenborg' THEN mask.antal END), 0) AS w,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'animo' THEN mask.antal END), 0) AS a,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'rex' THEN mask.antal END), 0) AS r,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'kalerm' THEN mask.antal END), 0) AS k,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'espresso' THEN mask.antal END), 0) AS e,
           coalesce(sum(CASE WHEN mask.brugt THEN mask.antal END), 0) AS bu,
           coalesce(sum(mask.antal * CASE
             WHEN mask.brugt THEN coalesce(o.bonus_brugt, 0)
             WHEN mask.bonusklasse = 'wittenborg' THEN coalesce(o.bonus_wittenborg, 0)
             WHEN mask.bonusklasse = 'animo' THEN coalesce(o.bonus_animo, 0)
             WHEN mask.bonusklasse = 'rex' THEN coalesce(o.bonus_rex, 0)
             WHEN mask.bonusklasse = 'kalerm' THEN coalesce(o.bonus_kalerm, 0)
             WHEN mask.bonusklasse = 'espresso' THEN coalesce(o.bonus_espresso, 0)
             ELSE 0 END), 0) AS beloeb
    FROM o LEFT JOIN mask ON mask.maaned = o.maaned AND mask.status = 'bonus'
      AND ((mask.kategori = 'privat' AND coalesce(o.maskin_privat, false))
        OR (mask.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
      AND ((mask.kilde = 'salg' AND coalesce(o.maskin_salg, false))
        OR (mask.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
      AND (NOT mask.brugt OR coalesce(o.maskin_brugt, false))
    GROUP BY o.maaned
  ),
  nyk AS (
    SELECT n.maaned, n.db, n.rang, n.beloeb
    FROM public.ny_kunde_bonus_maaned(_fra, _til) n WHERE n.saelger = _saelger
  ),
  raa AS (
    SELECT o.maaned, o.id AS ordning_id, o.flatrate,
           o.db_bund, o.db_top, o.maskin_bund, o.maskin_top, o.total_bund, o.total_top,
           db_pr.grundlag, coalesce(o.db_provision_pct, 0) AS pct,
           db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100 - coalesce(o.db_fradrag, 0) AS db_raa,
           mask_pr.w, mask_pr.a, mask_pr.r, mask_pr.k, mask_pr.e, mask_pr.bu,
           mask_pr.beloeb AS mask_raa,
           nyk.db AS nyk_db, nyk.rang AS nyk_rang, coalesce(nyk.beloeb, 0) AS nyk_beloeb
    FROM o
    JOIN db_pr ON db_pr.maaned = o.maaned
    JOIN mask_pr ON mask_pr.maaned = o.maaned
    LEFT JOIN nyk ON nyk.maaned = o.maaned
  ),
  klemt AS (
    SELECT raa.*,
           least(greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)),
                 coalesce(raa.db_top, greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)))) AS db_klemt,
           least(greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)),
                 coalesce(raa.maskin_top, greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)))) AS mask_klemt
    FROM raa
  )
  SELECT k.maaned, k.ordning_id, round(k.grundlag, 2), k.pct,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.db_klemt END, 2),
         k.w, k.a, k.r,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.mask_klemt END, 2),
         round(k.nyk_db, 2), k.nyk_rang,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.nyk_beloeb END, 2),
         round(CASE WHEN k.flatrate IS NOT NULL THEN k.flatrate
           ELSE least(
             greatest(k.db_klemt + k.mask_klemt + k.nyk_beloeb, coalesce(k.total_bund, k.db_klemt + k.mask_klemt + k.nyk_beloeb)),
             coalesce(k.total_top, greatest(k.db_klemt + k.mask_klemt + k.nyk_beloeb, coalesce(k.total_bund, k.db_klemt + k.mask_klemt + k.nyk_beloeb))))
           END, 2),
         k.k, k.e, k.bu
  FROM klemt k
  ORDER BY k.maaned;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bonus_maskin_advarsler(_maaned date)
 RETURNS TABLE(user_id uuid, navn text, uklassificeret integer, til_vurdering integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '0'
AS $function$
DECLARE m date := date_trunc('month', _maaned)::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
  RETURN QUERY
  SELECT s.user_id, s.navn,
         count(*) FILTER (WHERE d.bonusklasse IS NULL)::int,
         count(*) FILTER (WHERE d.bonusklasse IS NOT NULL)::int
  FROM public.bonus_afregning_saelgere(m) s
  CROSS JOIN LATERAL public.bonus_maskin_detaljer(s.user_id, m, m) d
  WHERE d.status = 'vurdering'
  GROUP BY s.user_id, s.navn;
END $function$;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_advarsler(date) TO authenticated;

CREATE OR REPLACE FUNCTION public._bonus_laas_saelger(_admin uuid, _saelger uuid, _maaned date, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '0'
AS $function$
DECLARE
  m date := date_trunc('month', _maaned)::date;
  k date; lv record; lb record; t1 numeric; t3 numeric; d1 numeric; d3 numeric; b record; r1 numeric; r3 numeric;
BEGIN
  IF NOT public.is_admin(_admin) THEN RAISE EXCEPTION 'Kun admin kan låse bonus'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  IF m >= date_trunc('month', now())::date THEN RAISE EXCEPTION 'Kun afsluttede måneder kan låses'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas WHERE user_id = _saelger AND maaned = m) THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bl_live (maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric, db_bonus numeric,
    antal_wittenborg numeric, antal_animo numeric, antal_rex numeric, maskinbonus numeric, ny_kunde_db numeric, ny_kunde_rang integer,
    ny_kunde_bonus numeric, samlet_bonus numeric, l1561 numeric, l1563 numeric) ON COMMIT DROP;
  DELETE FROM _bl_live;
  INSERT INTO _bl_live
  SELECT bp.maaned, bp.ordning_id, bp.db_grundlag, bp.db_provision_pct, bp.db_bonus, bp.antal_wittenborg, bp.antal_animo, bp.antal_rex,
         bp.maskinbonus, bp.ny_kunde_db, bp.ny_kunde_rang, bp.ny_kunde_bonus, bp.samlet_bonus,
         CASE WHEN o.flatrate IS NOT NULL THEN bp.samlet_bonus ELSE bp.db_bonus END,
         CASE WHEN o.flatrate IS NOT NULL THEN 0 ELSE bp.samlet_bonus - bp.db_bonus END
  FROM public.bonus_pr_maaned(_saelger, (m - interval '6 months')::date, m) bp
  LEFT JOIN bonus_ordning o ON o.id = bp.ordning_id;

  -- Efterregulering (seneste 6 låste måneder). DB: db_bonus efter minimum/fradrag; 1563: kun maskinbonus
  -- (ny kunde-bonus er endelig ved låsning). Fast provision: samlet bonus på 1561. Både + og − oprettes.
  FOR k IN SELECT l.maaned FROM bonus_laas l WHERE l.user_id = _saelger AND l.maaned < m AND l.maaned >= (m - interval '6 months')::date ORDER BY 1 LOOP
    SELECT x.* INTO lv FROM (SELECT 1) dd LEFT JOIN _bl_live x ON x.maaned = k;
    SELECT l.*, o.flatrate AS fast INTO lb FROM bonus_laas l LEFT JOIN bonus_ordning o ON o.id = l.ordning_id
      WHERE l.user_id = _saelger AND l.maaned = k;
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO t1, t3 FROM bonus_regulering WHERE user_id = _saelger AND kilde_maaned = k AND type = 'efterregulering';
    IF lb.fast IS NOT NULL THEN
      d1 := round(coalesce(lv.samlet_bonus, 0) - lb.samlet_bonus - t1, 2);
      d3 := 0;
    ELSE
      d1 := round(coalesce(lv.db_bonus, 0) - lb.db_bonus - t1, 2);
      d3 := round(coalesce(lv.maskinbonus, 0) - lb.maskinbonus - t3, 2);
    END IF;
    IF round(d1) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1561, d1, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': DB (sene fakturaer)', _admin);
    END IF;
    IF round(d3) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1563, d3, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': maskiner', _admin);
    END IF;
  END LOOP;

  SELECT * INTO b FROM _bl_live WHERE maaned = m;
  SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
    INTO r1, r3 FROM bonus_regulering WHERE user_id = _saelger AND udbetalingsmaaned = m;
  INSERT INTO bonus_laas (user_id, maaned, ordning_id, db_grundlag, db_provision_pct, db_bonus, antal_wittenborg, antal_animo, antal_rex,
    maskinbonus, samlet_bonus, ny_kunde_db, ny_kunde_rang, ny_kunde_bonus, regulering, loen_1561, loen_1563, maskiner, laast_note, laast_af, laast_at)
  VALUES (_saelger, m, b.ordning_id, coalesce(b.db_grundlag,0), coalesce(b.db_provision_pct,0), coalesce(b.db_bonus,0), coalesce(b.antal_wittenborg,0),
    coalesce(b.antal_animo,0), coalesce(b.antal_rex,0), coalesce(b.maskinbonus,0), coalesce(b.samlet_bonus,0), b.ny_kunde_db, b.ny_kunde_rang,
    coalesce(b.ny_kunde_bonus,0), r1 + r3, coalesce(b.l1561,0) + r1, coalesce(b.l1563,0) + r3,
    coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.bonus_maskin_detaljer(_saelger, m, m) d), '[]'::jsonb), _note, _admin, now());
END $function$;