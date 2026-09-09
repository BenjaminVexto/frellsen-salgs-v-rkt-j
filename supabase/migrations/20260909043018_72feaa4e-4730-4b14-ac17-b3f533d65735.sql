CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.bonus_ordning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gyldig_fra date NOT NULL,
  gyldig_til date NULL,
  db_provision_pct numeric NOT NULL DEFAULT 0,
  db_privat boolean NOT NULL DEFAULT true,
  db_offentlig boolean NOT NULL DEFAULT true,
  bonus_wittenborg numeric NOT NULL DEFAULT 0,
  bonus_animo numeric NOT NULL DEFAULT 0,
  bonus_rex numeric NOT NULL DEFAULT 0,
  maskin_privat boolean NOT NULL DEFAULT true,
  maskin_offentlig boolean NOT NULL DEFAULT true,
  maskin_salg boolean NOT NULL DEFAULT true,
  maskin_leje boolean NOT NULL DEFAULT true,
  maskin_brugt boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT bonus_ordning_fra_foerste CHECK (extract(day from gyldig_fra) = 1),
  CONSTRAINT bonus_ordning_periode CHECK (gyldig_til IS NULL OR gyldig_til >= gyldig_fra),
  CONSTRAINT bonus_ordning_ingen_overlap EXCLUDE USING gist (
    user_id WITH =,
    daterange(gyldig_fra, coalesce(gyldig_til, 'infinity'::date), '[]') WITH &&
  )
);

CREATE INDEX bonus_ordning_user_idx ON public.bonus_ordning (user_id, gyldig_fra);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_ordning TO authenticated;
GRANT ALL ON public.bonus_ordning TO service_role;

ALTER TABLE public.bonus_ordning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bruger kan se egne bonusordninger"
  ON public.bonus_ordning FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admin kan oprette bonusordninger"
  ON public.bonus_ordning FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin kan rette bonusordninger"
  ON public.bonus_ordning FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin kan slette bonusordninger"
  ON public.bonus_ordning FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Maskingrundlag: salg (78/84) tælles pr. faktureret antal, leje/udlån (80)
-- tælles én gang i den første måned varenummeret optræder på lokationen.
CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
RETURNS TABLE(
  maaned date, company_id uuid, navn text, by text, kategori text,
  maerke text, brugt boolean, kilde text, model text, antal numeric,
  faktura_dato date, beloeb numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  kunde AS (
    SELECT loc.visma_delivery_no, c.id, c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori
    FROM loc
    JOIN public.companies c ON c.id = loc.company_id
    WHERE c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ),
  basis AS (
    SELECT il.*
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11
      AND il.varegruppe_1 = '16'
      AND coalesce(il.varetekst, '') NOT ILIKE 'serienr%'
      AND coalesce(il.varetekst, '') NOT ILIKE '%skab%'
      AND coalesce(il.varetekst, '') NOT ILIKE '%udslagsskuffe%'
  ),
  salg AS (
    SELECT b.period AS maaned, b.visma_delivery_no, b.varetekst, b.antal,
           b.faktura_dato, b.beloeb, 'salg'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 IN ('78','84') AND b.antal > 0
  ),
  leje AS (
    SELECT DISTINCT ON (b.visma_delivery_no, b.varenr)
           b.period AS maaned, b.visma_delivery_no, b.varetekst, 1::numeric AS antal,
           b.faktura_dato, b.beloeb, 'leje'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 = '80' AND b.antal > 0
    ORDER BY b.visma_delivery_no, b.varenr, b.period, b.faktura_dato
  ),
  alle AS (SELECT * FROM salg UNION ALL SELECT * FROM leje)
  SELECT a.maaned, k.id, k.name, k.city, k.kategori,
         CASE
           WHEN a.varetekst ILIKE '%wittenborg%' THEN 'Wittenborg'
           WHEN a.varetekst ILIKE '%animo%'
             OR a.varetekst ILIKE '%optivend%'
             OR a.varetekst ILIKE '%optibean%'
             OR a.varetekst ILIKE '%optime%' THEN 'Animo'
           WHEN a.varetekst ILIKE '%rex-royal%' THEN 'Rex-Royal'
           ELSE 'Andet'
         END,
         (a.varetekst ILIKE '%brugt%'), a.kilde, a.varetekst, a.antal,
         a.faktura_dato, round(coalesce(a.beloeb, 0), 2)
  FROM alle a
  JOIN kunde k ON k.visma_delivery_no = a.visma_delivery_no
  WHERE a.maaned >= date_trunc('month', _fra)::date
    AND a.maaned <= date_trunc('month', _til)::date
    AND a.maaned < date_trunc('month', current_date)::date
$function$;

CREATE OR REPLACE FUNCTION public.bonus_pr_maaned(_saelger uuid, _fra date, _til date)
RETURNS TABLE(
  maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric,
  db_bonus numeric, antal_wittenborg numeric, antal_animo numeric, antal_rex numeric,
  maskinbonus numeric, samlet_bonus numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    SELECT m.maaned, b.*
    FROM m
    LEFT JOIN public.bonus_ordning b
      ON b.user_id = _saelger
     AND b.gyldig_fra <= m.maaned
     AND (b.gyldig_til IS NULL OR b.gyldig_til >= m.maaned)
  ),
  db AS (
    SELECT sm.period AS maaned,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           sum(sm.contribution) AS vaerdi
    FROM public.sales_monthly sm
    JOIN public.companies c ON c.id = sm.company_id
    WHERE sm.afdeling_nr = 11
      AND sm.period >= date_trunc('month', _fra)::date
      AND sm.period <= date_trunc('month', _til)::date
      AND sm.period < date_trunc('month', current_date)::date
      AND c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    GROUP BY 1, 2
  ),
  db_pr AS (
    SELECT o.maaned,
           coalesce(sum(db.vaerdi), 0) AS grundlag
    FROM o
    LEFT JOIN db ON db.maaned = o.maaned
      AND ((db.kategori = 'privat' AND coalesce(o.db_privat, false))
        OR (db.kategori = 'offentlig' AND coalesce(o.db_offentlig, false)))
    GROUP BY o.maaned
  ),
  mask AS (
    SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til)
  ),
  mask_pr AS (
    SELECT o.maaned,
           coalesce(sum(CASE WHEN mask.maerke = 'Wittenborg' THEN mask.antal END), 0) AS w,
           coalesce(sum(CASE WHEN mask.maerke = 'Animo' THEN mask.antal END), 0) AS a,
           coalesce(sum(CASE WHEN mask.maerke = 'Rex-Royal' THEN mask.antal END), 0) AS r
    FROM o
    LEFT JOIN mask ON mask.maaned = o.maaned
      AND ((mask.kategori = 'privat' AND coalesce(o.maskin_privat, false))
        OR (mask.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
      AND ((mask.kilde = 'salg' AND coalesce(o.maskin_salg, false))
        OR (mask.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
      AND (NOT mask.brugt OR coalesce(o.maskin_brugt, false))
    GROUP BY o.maaned
  )
  SELECT o.maaned,
         o.id,
         round(db_pr.grundlag, 2),
         coalesce(o.db_provision_pct, 0),
         round(db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100, 2),
         mask_pr.w, mask_pr.a, mask_pr.r,
         round(mask_pr.w * coalesce(o.bonus_wittenborg, 0)
             + mask_pr.a * coalesce(o.bonus_animo, 0)
             + mask_pr.r * coalesce(o.bonus_rex, 0), 2),
         round(db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100
             + mask_pr.w * coalesce(o.bonus_wittenborg, 0)
             + mask_pr.a * coalesce(o.bonus_animo, 0)
             + mask_pr.r * coalesce(o.bonus_rex, 0), 2)
  FROM o
  JOIN db_pr ON db_pr.maaned = o.maaned
  JOIN mask_pr ON mask_pr.maaned = o.maaned
  ORDER BY o.maaned;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bonus_db_detaljer(_saelger uuid, _fra date, _til date)
RETURNS TABLE(company_id uuid, navn text, by text, kategori text, db numeric, omsaetning numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT b.db_privat, b.db_offentlig
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _fra)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
    LIMIT 1
  )
  SELECT c.id, c.name, c.city,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3),
         round(sum(sm.contribution), 2), round(sum(sm.revenue), 2)
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  LEFT JOIN o ON true
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND ((public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = 'privat'
            AND coalesce(o.db_privat, false))
      OR (public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = 'offentlig'
            AND coalesce(o.db_offentlig, false)))
  GROUP BY c.id, c.name, c.city, c.binding_status, c.customer_segment_3
  ORDER BY 5 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bonus_maskin_detaljer(_saelger uuid, _fra date, _til date)
RETURNS TABLE(
  company_id uuid, navn text, by text, model text, maerke text, kilde text,
  brugt boolean, antal numeric, faktura_dato date, beloeb numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT b.*
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _fra)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
    LIMIT 1
  )
  SELECT g.company_id, g.navn, g.by, g.model, g.maerke, g.kilde, g.brugt,
         g.antal, g.faktura_dato, g.beloeb
  FROM public.bonus_maskin_grundlag(_saelger, _fra, _til) g
  LEFT JOIN o ON true
  WHERE g.maerke IN ('Wittenborg','Animo','Rex-Royal')
    AND ((g.kategori = 'privat' AND coalesce(o.maskin_privat, false))
      OR (g.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
    AND ((g.kilde = 'salg' AND coalesce(o.maskin_salg, false))
      OR (g.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
    AND (NOT g.brugt OR coalesce(o.maskin_brugt, false))
  ORDER BY g.faktura_dato;
END;
$function$;