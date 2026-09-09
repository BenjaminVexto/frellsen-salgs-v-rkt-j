ALTER TABLE public.bonus_ordning
  ADD COLUMN db_fradrag numeric NULL,
  ADD CONSTRAINT bonus_ordning_db_fradrag_positiv CHECK (db_fradrag IS NULL OR db_fradrag >= 0);

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
  ),
  raa AS (
    SELECT o.maaned, o.id AS ordning_id, o.flatrate,
           o.db_bund, o.db_top, o.maskin_bund, o.maskin_top, o.total_bund, o.total_top,
           db_pr.grundlag,
           coalesce(o.db_provision_pct, 0) AS pct,
           db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100
             - coalesce(o.db_fradrag, 0) AS db_raa,
           mask_pr.w, mask_pr.a, mask_pr.r,
           mask_pr.w * coalesce(o.bonus_wittenborg, 0)
         + mask_pr.a * coalesce(o.bonus_animo, 0)
         + mask_pr.r * coalesce(o.bonus_rex, 0) AS mask_raa
    FROM o
    JOIN db_pr ON db_pr.maaned = o.maaned
    JOIN mask_pr ON mask_pr.maaned = o.maaned
  ),
  klemt AS (
    SELECT raa.*,
           least(greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)),
                 coalesce(raa.db_top, greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)))) AS db_klemt,
           least(greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)),
                 coalesce(raa.maskin_top, greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)))) AS mask_klemt
    FROM raa
  )
  SELECT k.maaned,
         k.ordning_id,
         round(k.grundlag, 2),
         k.pct,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.db_klemt END, 2),
         k.w, k.a, k.r,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.mask_klemt END, 2),
         round(
           CASE
             WHEN k.flatrate IS NOT NULL THEN k.flatrate
             ELSE least(
               greatest(k.db_klemt + k.mask_klemt, coalesce(k.total_bund, k.db_klemt + k.mask_klemt)),
               coalesce(k.total_top, greatest(k.db_klemt + k.mask_klemt, coalesce(k.total_bund, k.db_klemt + k.mask_klemt)))
             )
           END, 2)
  FROM klemt k
  ORDER BY k.maaned;
END;
$function$;