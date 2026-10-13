CREATE OR REPLACE FUNCTION public._distrikt_saelger(_postnr text)
RETURNS TABLE(distrikt_id uuid, distrikt_navn text, saelger_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.id, d.navn, COALESCE(d.saelger_user_id, d.daekkes_af_user_id)
  FROM public.postnummer_flade_map m
  JOIN public.distrikt_flade df ON df.flade = m.flade
  JOIN public.distrikter d ON d.id = df.distrikt_id AND d.aktiv
  WHERE m.postnr = left(regexp_replace(coalesce(_postnr,''),'\D','','g'),4)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._distrikt_saelger(text) FROM PUBLIC, anon, authenticated;

-- Opslag for en liste af postnumre (intern brug, ikke telemarketing)
CREATE OR REPLACE FUNCTION public.distrikt_saelger_for_postnumre(_postnumre text[])
RETURNS TABLE(postnr text, distrikt_id uuid, distrikt_navn text, saelger_user_id uuid, saelger_navn text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() THEN
    RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p, s.distrikt_id, s.distrikt_navn, s.saelger_user_id, pr.full_name
  FROM unnest(_postnumre) p
  LEFT JOIN LATERAL public._distrikt_saelger(p) s ON true
  LEFT JOIN public.profiles pr ON pr.id = s.saelger_user_id;
END $$;
REVOKE ALL ON FUNCTION public.distrikt_saelger_for_postnumre(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distrikt_saelger_for_postnumre(text[]) TO authenticated;

-- Opslag pr. virksomhed (bruges ved oprettelse af kontaktliste)
CREATE OR REPLACE FUNCTION public.distrikt_saelger_for_virksomheder(_company_ids uuid[])
RETURNS TABLE(company_id uuid, saelger_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() THEN
    RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, s.saelger_user_id
  FROM public.companies c
  LEFT JOIN LATERAL public._distrikt_saelger(c.zip) s ON true
  WHERE c.id = ANY(_company_ids);
END $$;
REVOKE ALL ON FUNCTION public.distrikt_saelger_for_virksomheder(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distrikt_saelger_for_virksomheder(uuid[]) TO authenticated;

-- Postnumre for valgte distrikter (CVR-søgning)
CREATE OR REPLACE FUNCTION public.distrikt_postnumre(_distrikt_ids uuid[])
RETURNS integer[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(array_agg(DISTINCT p ORDER BY p), '{}')
    FROM public.distrikt_flade df
    JOIN public.postnummer_flader f ON f.flade = df.flade
    CROSS JOIN LATERAL unnest(f.postnumre) p
    WHERE df.distrikt_id = ANY(_distrikt_ids));
END $$;
REVOKE ALL ON FUNCTION public.distrikt_postnumre(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distrikt_postnumre(uuid[]) TO authenticated;

-- Distriktsoversigt med antal flader/postnumre (CVR-søgningens distriktsknapper)
CREATE OR REPLACE FUNCTION public.distrikt_oversigt()
RETURNS TABLE(id uuid, navn text, farve text, sort integer, saelger_user_id uuid, daekkes_af_user_id uuid, saelger_navn text, daekkes_af_navn text, flader integer, postnumre integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT d.id, d.navn, d.farve, d.sort::int, d.saelger_user_id, d.daekkes_af_user_id,
    ps.full_name, pd.full_name,
    (SELECT count(*)::int FROM public.distrikt_flade df WHERE df.distrikt_id = d.id),
    (SELECT count(DISTINCT p)::int FROM public.distrikt_flade df JOIN public.postnummer_flader f ON f.flade = df.flade CROSS JOIN LATERAL unnest(f.postnumre) p WHERE df.distrikt_id = d.id)
  FROM public.distrikter d
  LEFT JOIN public.profiles ps ON ps.id = d.saelger_user_id
  LEFT JOIN public.profiles pd ON pd.id = d.daekkes_af_user_id
  WHERE d.aktiv ORDER BY d.sort, d.navn;
END $$;
REVOKE ALL ON FUNCTION public.distrikt_oversigt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distrikt_oversigt() TO authenticated;

-- Telemarketingens mødemodtager bruger samme opslag
CREATE OR REPLACE FUNCTION public.tm_moede_saelger(_list uuid, _company uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN l.moede_modtager = 'fast' THEN l.moede_saelger_user_id
  ELSE COALESCE((SELECT s.saelger_user_id FROM public.companies c, LATERAL public._distrikt_saelger(c.zip) s WHERE c.id = _company), l.moede_saelger_user_id) END
  FROM public.contact_lists l WHERE l.id = _list
$$;