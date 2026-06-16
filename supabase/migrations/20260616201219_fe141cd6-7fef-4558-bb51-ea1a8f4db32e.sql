
-- 1) Tabel
CREATE TABLE public.products (
  varenr text PRIMARY KEY,
  beskrivelse text,
  produktprisgruppe_1 text,
  produktprisgruppe_2 text,
  produktprisgruppe_3 text,
  kategori text,
  listepris numeric,
  udlejningspris numeric,
  kan_lejes boolean NOT NULL DEFAULT false,
  kilde text NOT NULL DEFAULT 'prismatrix',
  record_status text NOT NULL DEFAULT 'aktiv',
  -- egne salgsfelter (bevares ved re-import)
  is_tilbudsegnet boolean NOT NULL DEFAULT false,
  salgsbeskrivelse text,
  billede_url text,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_kategori_idx ON public.products(kategori);
CREATE INDEX products_status_idx ON public.products(record_status);
CREATE INDEX products_tilbudsegnet_idx ON public.products(is_tilbudsegnet) WHERE is_tilbudsegnet;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Indloggede kan se produkter"
  ON public.products FOR SELECT TO authenticated USING (true);

-- Kun admin kan oprette/slette katalog-rækker (gen-opbygning sker via security-definer-fn)
CREATE POLICY "Admin kan oprette produkter"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin kan slette produkter"
  ON public.products FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Indloggede kan opdatere produkter (UI ændrer kun egne salgsfelter; admin kan ændre alt)
CREATE POLICY "Indloggede kan opdatere produkter"
  ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Gen-opbygnings-funktion
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
        WHERE COALESCE(fak_kundenr, '') = ''
          AND COALESCE(kundeprisgruppe1, '') = ''
          AND COALESCE(kundeprisgruppe2, '') = ''
          AND COALESCE(udsalgspris, 0) > 0
      ) AS listepris,
      MAX(udlejningspris) FILTER (
        WHERE COALESCE(fak_kundenr, '') = ''
          AND COALESCE(kundeprisgruppe1, '') = ''
          AND COALESCE(kundeprisgruppe2, '') = ''
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
      COALESCE(ap.pg1, stp.pg1) AS pg1,
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
        WHEN COALESCE(m.kan_lejes, false) THEN 'maskine'
        WHEN pg2 ILIKE '%maskine%' THEN 'maskine'
        WHEN pg2 ILIKE '%tilbeh%' THEN 'tilbehoer'
        WHEN pg2 ILIKE '%kaffe%' THEN 'kaffe'
        WHEN pg2 ILIKE '%chokolade%' OR pg2 ILIKE '%fl_deboll%' THEN 'chokolade'
        WHEN pg2 ~* '(^|[^a-zæøå])te([^a-zæøå]|$)' OR pg2 ILIKE '%urtete%' THEN 'te'
        WHEN NULLIF(substring(pg2 from '^(\d+)'), '')::int = ANY (ARRAY[12,13,14]) THEN 'kaffe'
        WHEN NULLIF(substring(pg2 from '^(\d+)'), '')::int = 22 THEN 'te'
        WHEN NULLIF(substring(pg2 from '^(\d+)'), '')::int = 58 THEN 'chokolade'
        WHEN NULLIF(substring(pg2 from '^(\d+)'), '')::int = 78 THEN 'maskine'
        WHEN NULLIF(substring(pg2 from '^(\d+)'), '')::int = 79 THEN 'tilbehoer'
        ELSE 'ovrigt'
      END AS kategori
    FROM src s
    LEFT JOIN m ON m.varenr = s.varenr
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
    -- Visma-felter overskrives
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

-- 3) Kør én gang ved migration
SELECT public.rebuild_products();
