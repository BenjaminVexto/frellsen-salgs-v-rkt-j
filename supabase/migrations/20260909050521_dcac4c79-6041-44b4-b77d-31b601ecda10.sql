CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text, model text, antal numeric, faktura_dato date, beloeb numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      AND NOT public.maskin_er_tilvalg(il.varetekst)
  ),
  -- første måned lokationen overhovedet har en maskinlinje
  loc_start AS (
    SELECT il.visma_delivery_no, min(il.period) AS p0
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16'
    GROUP BY 1
  ),
  salg AS (
    SELECT b.period AS maaned, b.visma_delivery_no, b.varetekst, b.antal,
           b.faktura_dato, b.beloeb, 'salg'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 IN ('78','84') AND b.antal > 0
  ),
  leje_alle AS (
    SELECT DISTINCT ON (b.visma_delivery_no, public.maskin_maerke(b.varetekst), public.maskin_modelfamilie(b.varetekst))
           b.period AS maaned, b.visma_delivery_no, b.varetekst, 1::numeric AS antal,
           b.faktura_dato, b.beloeb, 'leje'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 = '80' AND b.antal > 0
    ORDER BY b.visma_delivery_no, public.maskin_maerke(b.varetekst),
             public.maskin_modelfamilie(b.varetekst), b.period, b.faktura_dato
  ),
  -- leje tælles kun på lokationer uden maskinhistorik i en tidligere måned
  leje AS (
    SELECT la.*
    FROM leje_alle la
    JOIN loc_start ls ON ls.visma_delivery_no = la.visma_delivery_no
    WHERE la.maaned <= ls.p0
  ),
  alle AS (SELECT * FROM salg UNION ALL SELECT * FROM leje)
  SELECT a.maaned, k.id, k.name, k.city, k.kategori,
         public.maskin_maerke(a.varetekst),
         (a.varetekst ILIKE '%brugt%'), a.kilde, a.varetekst, a.antal,
         a.faktura_dato, round(coalesce(a.beloeb, 0), 2)
  FROM alle a
  JOIN kunde k ON k.visma_delivery_no = a.visma_delivery_no
  WHERE a.maaned >= date_trunc('month', _fra)::date
    AND a.maaned <= date_trunc('month', _til)::date
    AND a.maaned < date_trunc('month', current_date)::date
$$;