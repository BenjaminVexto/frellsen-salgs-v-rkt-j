CREATE OR REPLACE FUNCTION public.analyse_pivot(_fra date, _til date, _opdel text, _afdeling_nr integer, _saelger_ids uuid[] DEFAULT NULL::uuid[], _kundeprisgrupper text[] DEFAULT NULL::text[], _varegrupper text[] DEFAULT NULL::text[], _regioner text[] DEFAULT NULL::text[], _kg_gruppe text DEFAULT '2'::text, _limit integer DEFAULT 200, _offset integer DEFAULT 0)
 RETURNS TABLE(noegle text, navn text, omsaetning numeric, kg numeric, stk numeric, db numeric, antal_kunder integer, total_grupper integer, total_omsaetning numeric, total_kg numeric, total_stk numeric, total_db numeric, total_kunder integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _brug_lok boolean := (_opdel IN ('region', 'postnummer') OR _regioner IS NOT NULL);
  _maa_db boolean := public.maa_se_db(auth.uid());
  _lim int := CASE WHEN _limit IS NULL OR _limit <= 0 THEN NULL ELSE _limit END;
  _off int := greatest(coalesce(_offset, 0), 0);
BEGIN
  IF _opdel = 'kunde' THEN
    -- Opdeling pr. kunde: én hash-aggregering, antal_kunder er altid 1.
    RETURN QUERY
    WITH base AS (
      SELECT sm.company_id, sm.product_group_1, sm.revenue, sm.weight_kg, sm.quantity, sm.contribution,
             c.name AS c_navn
      FROM public.sales_monthly sm
      JOIN public.companies c ON c.id = sm.company_id
      LEFT JOIN public.locations l ON _brug_lok AND l.id = sm.location_id
      WHERE sm.afdeling_nr = _afdeling_nr
        AND sm.period >= date_trunc('month', _fra)::date
        AND sm.period <= date_trunc('month', _til)::date
        AND c.afloest_af_company_id IS NULL
        AND (_saelger_ids IS NULL OR c.assigned_to = ANY(_saelger_ids))
        AND (_kundeprisgrupper IS NULL OR coalesce(c.customer_category, '—') = ANY(_kundeprisgrupper))
        AND (_varegrupper IS NULL OR coalesce(sm.product_group_1, '—') = ANY(_varegrupper))
        AND (_regioner IS NULL OR coalesce(l.region, 'Ukendt') = ANY(_regioner))
    ), agg AS (
      SELECT
        b.company_id::text AS noegle,
        max(b.c_navn) AS navn,
        coalesce(sum(b.revenue), 0)::numeric AS omsaetning,
        coalesce(sum(b.weight_kg) FILTER (
          WHERE _kg_gruppe IS NULL OR coalesce(b.product_group_1, '—') = _kg_gruppe
        ), 0)::numeric AS kg,
        coalesce(sum(b.quantity), 0)::numeric AS stk,
        CASE WHEN _maa_db THEN coalesce(sum(b.contribution), 0)::numeric ELSE NULL END AS db,
        1 AS antal_kunder
      FROM base b
      GROUP BY b.company_id
    ), totaler AS (
      SELECT count(*)::int AS grupper,
             coalesce(sum(a.omsaetning), 0)::numeric AS omsaetning,
             coalesce(sum(a.kg), 0)::numeric AS kg,
             coalesce(sum(a.stk), 0)::numeric AS stk,
             CASE WHEN _maa_db THEN coalesce(sum(a.db), 0)::numeric ELSE NULL END AS db
      FROM agg a
    )
    SELECT a.noegle, a.navn, a.omsaetning, a.kg, a.stk, a.db, a.antal_kunder,
           t.grupper, t.omsaetning, t.kg, t.stk, t.db, t.grupper
    FROM agg a CROSS JOIN totaler t
    ORDER BY a.omsaetning DESC
    OFFSET _off
    LIMIT _lim;
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT sm.company_id, sm.product_group_1, sm.revenue, sm.weight_kg, sm.quantity, sm.contribution,
           c.customer_category, c.assigned_to,
           l.zip_norm AS l_zip,
           nullif(btrim(coalesce(l.city, '')), '') AS l_city,
           coalesce(l.region, 'Ukendt') AS l_region
    FROM public.sales_monthly sm
    JOIN public.companies c ON c.id = sm.company_id
    LEFT JOIN public.locations l ON _brug_lok AND l.id = sm.location_id
    WHERE sm.afdeling_nr = _afdeling_nr
      AND sm.period >= date_trunc('month', _fra)::date
      AND sm.period <= date_trunc('month', _til)::date
      AND c.afloest_af_company_id IS NULL
      AND (_saelger_ids IS NULL OR c.assigned_to = ANY(_saelger_ids))
      AND (_kundeprisgrupper IS NULL OR coalesce(c.customer_category, '—') = ANY(_kundeprisgrupper))
      AND (_varegrupper IS NULL OR coalesce(sm.product_group_1, '—') = ANY(_varegrupper))
      AND (_regioner IS NULL OR coalesce(l.region, 'Ukendt') = ANY(_regioner))
  ), keyed AS (
    SELECT b.*, CASE _opdel
      WHEN 'varegruppe' THEN coalesce(b.product_group_1, '—')
      WHEN 'kundeprisgruppe' THEN coalesce(b.customer_category, '—')
      WHEN 'region' THEN b.l_region
      WHEN 'postnummer' THEN coalesce(b.l_zip, 'Ukendt')
      ELSE coalesce(b.assigned_to::text, '—')
    END AS k
    FROM base b
  ), pr_kunde AS (
    -- Trin 1: én række pr. (gruppe, kunde) — hash-aggregering, ingen sortering.
    SELECT
      k2.k,
      k2.company_id,
      max(k2.l_city) AS l_city,
      coalesce(sum(k2.revenue), 0)::numeric AS omsaetning,
      coalesce(sum(k2.weight_kg) FILTER (
        WHERE _kg_gruppe IS NULL OR coalesce(k2.product_group_1, '—') = _kg_gruppe
      ), 0)::numeric AS kg,
      coalesce(sum(k2.quantity), 0)::numeric AS stk,
      coalesce(sum(k2.contribution), 0)::numeric AS db
    FROM keyed k2
    GROUP BY k2.k, k2.company_id
  ), agg AS (
    -- Trin 2: tæl rækkerne fra trin 1 i stedet for count(DISTINCT ...).
    SELECT
      p.k AS noegle,
      CASE _opdel
        WHEN 'varegruppe' THEN coalesce(public.gruppe_navn(_afdeling_nr, p.k), p.k)
        WHEN 'kundeprisgruppe' THEN p.k
        WHEN 'region' THEN p.k
        WHEN 'postnummer' THEN CASE WHEN p.k = 'Ukendt' THEN 'Ukendt'
          ELSE btrim(p.k || ' ' || coalesce(max(p.l_city), '')) END
        ELSE coalesce(public.saelger_navn(nullif(p.k, '—')::uuid), 'Ingen sælger')
      END AS navn,
      sum(p.omsaetning)::numeric AS omsaetning,
      sum(p.kg)::numeric AS kg,
      sum(p.stk)::numeric AS stk,
      CASE WHEN _maa_db THEN sum(p.db)::numeric ELSE NULL END AS db,
      count(*)::int AS antal_kunder
    FROM pr_kunde p
    GROUP BY p.k
  ), kunder AS (
    SELECT count(*)::int AS n FROM (
      SELECT p.company_id FROM pr_kunde p GROUP BY p.company_id
    ) d
  ), totaler AS (
    SELECT count(*)::int AS grupper,
           coalesce(sum(a.omsaetning), 0)::numeric AS omsaetning,
           coalesce(sum(a.kg), 0)::numeric AS kg,
           coalesce(sum(a.stk), 0)::numeric AS stk,
           CASE WHEN _maa_db THEN coalesce(sum(a.db), 0)::numeric ELSE NULL END AS db
    FROM agg a
  )
  SELECT a.noegle, a.navn, a.omsaetning, a.kg, a.stk, a.db, a.antal_kunder,
         t.grupper, t.omsaetning, t.kg, t.stk, t.db, kd.n
  FROM agg a CROSS JOIN totaler t CROSS JOIN kunder kd
  ORDER BY a.omsaetning DESC
  OFFSET _off
  LIMIT _lim;
END;
$function$;