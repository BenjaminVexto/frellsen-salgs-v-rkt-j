CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, kategori text, antal integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH acc AS (
    SELECT c.id, c.created_in_visma, c.binding_status,
           coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), '') AS gkey,
           (SELECT min(sm.period) FROM public.sales_monthly sm
             WHERE sm.company_id = c.id AND sm.afdeling_nr = 11 AND sm.revenue > 0) AS foerste_ordre
    FROM public.companies c
    WHERE c.afdeling_nr = 11
      AND c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND c.created_in_visma IS NOT NULL
  ), grp AS (
    SELECT a.gkey,
           min(a.foerste_ordre) AS foerste_ordre,
           (array_agg(a.binding_status ORDER BY a.created_in_visma, a.id))[1] AS binding_status
    FROM acc a
    GROUP BY a.gkey
  )
  SELECT date_trunc('month', g.foerste_ordre)::date,
         CASE g.binding_status
           WHEN 'frit_salg' THEN 'privat'
           WHEN 'offentlig_aftale' THEN 'offentlig'
           ELSE 'andet'
         END,
         count(*)::int
  FROM grp g
  WHERE g.foerste_ordre IS NOT NULL
    AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$function$;

DROP FUNCTION IF EXISTS public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date);

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL::date)
 RETURNS TABLE(gruppe_key text, gruppe_navn text, gruppe_by text, gruppe_oprettet date, gruppe_foerste_ordre date, antal_konti integer, company_id uuid, navn text, by text, oprettet date, foerste_ordre date, kundeprisgruppe_2 text, omsaetning numeric, sidste_koeb date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH acc AS (
    SELECT c.id, c.name, c.city, c.created_in_visma, c.binding_status, c.customer_segment_2,
           coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), '') AS gkey,
           s.omsaetning, s.sidste_koeb,
           (SELECT min(sm.period) FROM public.sales_monthly sm
             WHERE sm.company_id = c.id AND sm.afdeling_nr = 11 AND sm.revenue > 0) AS foerste_ordre
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT sum(sm.revenue) AS omsaetning, max(sm.last_invoice_date) AS sidste_koeb
      FROM public.sales_monthly sm
      WHERE sm.company_id = c.id
        AND sm.afdeling_nr = 11
        AND sm.period >= date_trunc('month', c.created_in_visma)::date
    ) s ON true
    WHERE c.afdeling_nr = 11
      AND c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND c.created_in_visma IS NOT NULL
  ), grp AS (
    SELECT a.gkey,
           min(a.created_in_visma) AS foerste_oprettet,
           min(a.foerste_ordre) AS foerste_ordre,
           count(*)::int AS antal_konti,
           (array_agg(a.binding_status ORDER BY a.created_in_visma, a.id))[1] AS binding_status,
           (array_agg(a.name ORDER BY a.created_in_visma, a.id))[1] AS navn,
           (array_agg(a.city ORDER BY a.created_in_visma, a.id))[1] AS by
    FROM acc a
    GROUP BY a.gkey
  ), valgt AS (
    SELECT g.*
    FROM grp g
    WHERE g.foerste_ordre IS NOT NULL
      AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
      AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
      AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
      AND (_maaned IS NULL OR date_trunc('month', g.foerste_ordre)::date = date_trunc('month', _maaned)::date)
      AND (CASE g.binding_status
             WHEN 'frit_salg' THEN 'privat'
             WHEN 'offentlig_aftale' THEN 'offentlig'
             ELSE 'andet' END) = _kategori
  )
  SELECT v.gkey, v.navn, v.by, v.foerste_oprettet, v.foerste_ordre, v.antal_konti,
         a.id, a.name, a.city, a.created_in_visma, a.foerste_ordre, a.customer_segment_2,
         round(coalesce(a.omsaetning, 0), 2), a.sidste_koeb
  FROM valgt v
  JOIN acc a ON a.gkey = v.gkey
  ORDER BY v.foerste_ordre, v.gkey, a.foerste_ordre NULLS LAST, a.created_in_visma;
END;
$function$;

REVOKE ALL ON FUNCTION public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_nye_kunder_detaljer(uuid, date, date, text, date) TO service_role;