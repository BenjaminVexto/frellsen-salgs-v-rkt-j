-- Tilvalg/funktioner der ikke er maskiner
CREATE OR REPLACE FUNCTION public.maskin_tilvalg_moenstre()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'typer mælk',
    'kandefunktion',
    'møntautomat',
    'betalingssystem',
    'underskab',
    'skab',
    'kølekabinet',
    'tilbehør',
    'udslagsskuffe'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION public.maskin_er_tilvalg(_txt text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_txt, '') ILIKE 'serienr%'
     OR EXISTS (
       SELECT 1 FROM unnest(public.maskin_tilvalg_moenstre()) m
       WHERE lower(coalesce(_txt, '')) LIKE '%' || m || '%'
     )
$$;

-- Modelfamilie: varetekst uden årgangsparentes, effektangivelse og leje-suffiks
CREATE OR REPLACE FUNCTION public.maskin_modelfamilie(_txt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text;
BEGIN
  t := lower(coalesce(_txt, ''));
  t := regexp_replace(t, '([0-9]),([0-9])', '\1.\2', 'g');
  t := regexp_replace(t, '\([^)]*\)', ' ', 'g');
  t := regexp_replace(t, '[0-9]+(\.[0-9]+)?( *- *[0-9]+(\.[0-9]+)?)? *kw', ' ', 'g');
  t := regexp_replace(t, '[0-9]+ *v( |,|$)', ' ', 'g');
  t := replace(t, '/', ' ');
  t := regexp_replace(t, '\s*inkl\.?\s*', ' ', 'g');
  FOR i IN 1..3 LOOP
    t := regexp_replace(t, '[ ,.]*(leje|l)[ ,.]*$', '');
  END LOOP;
  t := regexp_replace(t, '[^a-z0-9æøå+]', '', 'g');
  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION public.maskin_maerke(_txt text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce(_txt,'') ILIKE '%wittenborg%' THEN 'Wittenborg'
    WHEN coalesce(_txt,'') ILIKE '%animo%'
      OR coalesce(_txt,'') ILIKE '%optivend%'
      OR coalesce(_txt,'') ILIKE '%optibean%'
      OR coalesce(_txt,'') ILIKE '%optime%' THEN 'Animo'
    WHEN coalesce(_txt,'') ILIKE '%rex-royal%' THEN 'Rex-Royal'
    ELSE 'Andet'
  END
$$;

REVOKE ALL ON FUNCTION public.maskin_tilvalg_moenstre() FROM public;
REVOKE ALL ON FUNCTION public.maskin_er_tilvalg(text) FROM public;
REVOKE ALL ON FUNCTION public.maskin_modelfamilie(text) FROM public;
REVOKE ALL ON FUNCTION public.maskin_maerke(text) FROM public;
GRANT EXECUTE ON FUNCTION public.maskin_tilvalg_moenstre() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.maskin_er_tilvalg(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.maskin_modelfamilie(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.maskin_maerke(text) TO authenticated, service_role;

-- Bonusgrundlag: salg pr. linje, leje pr. første måned med samme mærke+modelfamilie på lokationen
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
  salg AS (
    SELECT b.period AS maaned, b.visma_delivery_no, b.varetekst, b.antal,
           b.faktura_dato, b.beloeb, 'salg'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 IN ('78','84') AND b.antal > 0
  ),
  leje AS (
    SELECT DISTINCT ON (b.visma_delivery_no, public.maskin_maerke(b.varetekst), public.maskin_modelfamilie(b.varetekst))
           b.period AS maaned, b.visma_delivery_no, b.varetekst, 1::numeric AS antal,
           b.faktura_dato, b.beloeb, 'leje'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 = '80' AND b.antal > 0
    ORDER BY b.visma_delivery_no, public.maskin_maerke(b.varetekst),
             public.maskin_modelfamilie(b.varetekst), b.period, b.faktura_dato
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

REVOKE ALL ON FUNCTION public.bonus_maskin_grundlag(uuid, date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_grundlag(uuid, date, date) TO service_role;

-- Målepunkter: samme tilvalgsfiltrering og mærkeudledning
CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner(_saelger uuid, _fra date, _til date, _kundetype text DEFAULT 'alle')
RETURNS TABLE(maaned date, maerke text, brugt boolean, antal numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT il.period AS maaned,
         public.maskin_maerke(il.varetekst) AS maerke,
         (il.varetekst ILIKE '%brugt%') AS brugt,
         sum(il.antal) AS antal
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = 11
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND NOT public.maskin_er_tilvalg(il.varetekst)
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  GROUP BY 1, 2, 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner_detaljer(_saelger uuid, _fra date, _til date, _maerke text, _brugt boolean DEFAULT NULL, _kundetype text DEFAULT 'alle', _maaned date DEFAULT NULL)
RETURNS TABLE(company_id uuid, navn text, by text, model text, antal numeric, faktura_dato date, beloeb numeric, brugt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT c.id, c.name, c.city, il.varetekst, il.antal, il.faktura_dato,
         round(coalesce(il.beloeb, 0), 2), (il.varetekst ILIKE '%brugt%')
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = 11
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND NOT public.maskin_er_tilvalg(il.varetekst)
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR il.period = date_trunc('month', _maaned)::date)
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (_maerke IS NULL OR _maerke = public.maskin_maerke(il.varetekst))
    AND (_brugt IS NULL OR _brugt = (il.varetekst ILIKE '%brugt%'))
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  ORDER BY il.faktura_dato;
END;
$$;
