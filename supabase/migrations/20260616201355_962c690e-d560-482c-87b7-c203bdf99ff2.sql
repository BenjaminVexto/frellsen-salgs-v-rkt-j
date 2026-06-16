
CREATE OR REPLACE FUNCTION public.rebuild_products()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH ap AS (
    SELECT varenr,
      MAX(NULLIF(beskrivelse, '')) AS beskrivelse,
      MAX(NULLIF(NULLIF(produktprisgruppe1, ''), '0')) AS pg1,
      MAX(NULLIF(NULLIF(produktprisgruppe2, ''), '0')) AS pg2,
      MAX(NULLIF(NULLIF(produktprisgruppe3, ''), '0')) AS pg3,
      MAX(udsalgspris) FILTER (
        WHERE NULLIF(NULLIF(fak_kundenr, ''), '0') IS NULL
          AND NULLIF(NULLIF(kundeprisgruppe1, ''), '0') IS NULL
          AND NULLIF(NULLIF(kundeprisgruppe2, ''), '0') IS NULL
          AND COALESCE(udsalgspris, 0) > 0
      ) AS listepris,
      MAX(udlejningspris) FILTER (
        WHERE NULLIF(NULLIF(fak_kundenr, ''), '0') IS NULL
          AND NULLIF(NULLIF(kundeprisgruppe1, ''), '0') IS NULL
          AND NULLIF(NULLIF(kundeprisgruppe2, ''), '0') IS NULL
          AND COALESCE(udlejningspris, 0) > 0
      ) AS udlejningspris
    FROM public.agreement_pricing
    WHERE varenr IS NOT NULL AND varenr <> ''
    GROUP BY varenr
  ),
  stp AS (
    SELECT varenr,
      MAX(NULLIF(description, '')) AS beskrivelse,
      MAX(NULLIF(NULLIF(product_group_1, ''), '0')) AS pg1
    FROM public.sales_top_products
    WHERE varenr IS NOT NULL AND varenr <> ''
    GROUP BY varenr
  ),
  m AS (
    SELECT varenr,
      MAX(NULLIF(beskrivelse, '')) AS beskrivelse,
      bool_or(udlanstype ILIKE '%leje%' OR udlanstype ILIKE '%udl%n%') AS kan_lejes
    FROM public.machines
    WHERE varenr IS NOT NULL AND varenr <> ''
    GROUP BY varenr
  ),
  u AS (
    SELECT varenr FROM ap
    UNION SELECT varenr FROM stp
    UNION SELECT varenr FROM m
  ),
  src AS (
    SELECT u.varenr,
      COALESCE(ap.beskrivelse, stp.beskrivelse, m.beskrivelse) AS beskrivelse,
      -- pg1: agreement_pricing har næsten aldrig pg pr. varenr, så stp er primær
      COALESCE(stp.pg1, ap.pg1) AS pg1,
      ap.pg2, ap.pg3,
      ap.listepris, ap.udlejningspris,
      COALESCE(m.kan_lejes, false) AS kan_lejes,
      CASE WHEN ap.varenr IS NOT NULL THEN 'prismatrix' ELSE 'kun_historik' END AS kilde,
      CASE WHEN ap.varenr IS NOT NULL THEN 'aktiv' ELSE 'udgaaet' END AS record_status
    FROM u
    LEFT JOIN ap ON ap.varenr = u.varenr
    LEFT JOIN stp ON stp.varenr = u.varenr
    LEFT JOIN m ON m.varenr = u.varenr
  ),
  src2 AS (
    SELECT s.*,
      CASE
        -- 1) Maskine: ægte maskinrække eller pg/beskrivelse siger det
        WHEN s.kan_lejes THEN 'maskine'
        WHEN pg1 ILIKE '%maskine%' OR pg2 ILIKE '%maskine%' THEN 'maskine'
        -- 2) PG2 navnematch (mest specifikt)
        WHEN pg2 ILIKE '%tilbeh%' OR pg2 ILIKE '%reservedel%' OR pg2 ILIKE '%vandfilter%' OR pg2 ILIKE '%FPPG%' THEN 'tilbehoer'
        WHEN pg2 ILIKE '%kaffe%' THEN 'kaffe'
        WHEN pg2 ILIKE '%chokolade%' OR pg2 ILIKE '%fl%debol%' THEN 'chokolade'
        WHEN pg2 ILIKE '% te %' OR pg2 ILIKE '%[Te %' OR pg2 ILIKE 'Te %' OR pg2 ILIKE '%urtete%' THEN 'te'
        -- 3) PG1 navnematch
        WHEN pg1 ILIKE '%kaffe%' THEN 'kaffe'
        WHEN pg1 ILIKE '%te%' AND pg1 NOT ILIKE '%maskine%' AND pg1 NOT ILIKE '%service%' THEN 'te'
        WHEN pg1 ILIKE '%chokolade%' THEN 'chokolade'
        WHEN pg1 ILIKE '%vandfilter%' OR pg1 ILIKE '%FPPG%' OR pg1 ILIKE '%reservedel%' OR pg1 ILIKE '%butik%' OR pg1 ILIKE '%service art%' THEN 'tilbehoer'
        -- 4) PG1-kode (fra sales_top_products: 2=Kaffe, 4=Te, 10=Chokolade, 14=Sukkervare/Slik, 16=Maskiner, 17=Vandfilter, 18=Reservedele, 22=Butik)
        WHEN NULLIF(substring(pg1 from '^(\d+)'), '')::int = 2 THEN 'kaffe'
        WHEN NULLIF(substring(pg1 from '^(\d+)'), '')::int = 4 THEN 'te'
        WHEN NULLIF(substring(pg1 from '^(\d+)'), '')::int IN (10,14) THEN 'chokolade'
        WHEN NULLIF(substring(pg1 from '^(\d+)'), '')::int = 16 THEN 'maskine'
        WHEN NULLIF(substring(pg1 from '^(\d+)'), '')::int IN (8,17,18,22) THEN 'tilbehoer'
        -- 5) Fallback: navne-match i beskrivelse
        WHEN beskrivelse ILIKE '%kaffe%' OR beskrivelse ~* '\m(espresso|arabica|robusta|HB|VAC|instant)\M' THEN 'kaffe'
        WHEN beskrivelse ILIKE '% te %' OR beskrivelse ILIKE 'te %' OR beskrivelse ILIKE '%urtete%' OR beskrivelse ILIKE '%Sencha%' THEN 'te'
        WHEN beskrivelse ILIKE '%chokolade%' OR beskrivelse ILIKE '%fl%debol%' THEN 'chokolade'
        WHEN beskrivelse ILIKE '%filter%' OR beskrivelse ILIKE '%reservedel%' OR beskrivelse ILIKE '%slange%' THEN 'tilbehoer'
        ELSE 'ovrigt'
      END AS kategori
    FROM src s
  )
  INSERT INTO public.products AS p (
    varenr, beskrivelse,
    produktprisgruppe_1, produktprisgruppe_2, produktprisgruppe_3,
    kategori, listepris, udlejningspris, kan_lejes, kilde, record_status
  )
  SELECT varenr, beskrivelse, pg1, pg2, pg3, kategori,
         listepris, udlejningspris, kan_lejes, kilde, record_status
  FROM src2
  ON CONFLICT (varenr) DO UPDATE SET
    beskrivelse         = EXCLUDED.beskrivelse,
    produktprisgruppe_1 = EXCLUDED.produktprisgruppe_1,
    produktprisgruppe_2 = EXCLUDED.produktprisgruppe_2,
    produktprisgruppe_3 = EXCLUDED.produktprisgruppe_3,
    kategori            = EXCLUDED.kategori,
    listepris           = EXCLUDED.listepris,
    udlejningspris      = EXCLUDED.udlejningspris,
    kan_lejes           = EXCLUDED.kan_lejes,
    kilde               = EXCLUDED.kilde,
    record_status       = EXCLUDED.record_status,
    updated_at          = now();
    -- BEVARES: is_tilbudsegnet, salgsbeskrivelse, billede_url, sort_order
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_products() TO service_role;

SELECT public.rebuild_products();
