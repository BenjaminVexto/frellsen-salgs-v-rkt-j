
CREATE TABLE IF NOT EXISTS public._product_master_import_log (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  report jsonb
);
GRANT SELECT ON public._product_master_import_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._map_kategori_from_pg2(_pg2 text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE
    WHEN _pg2 IN ('2','4','8','12','14','15') THEN 'kaffe'
    WHEN _pg2 IN ('22','24') THEN 'te'
    WHEN _pg2 IN ('32','54','58') THEN 'chokolade'
    WHEN _pg2 = '36' THEN 'maelk'
    WHEN _pg2 IN ('78','80','81','82','83') THEN 'maskine'
    WHEN _pg2 IN ('44','46','48','50','79','85','86','87','88','92','94','118') THEN 'tilbehoer'
    ELSE 'ovrigt'
  END
$fn$;

CREATE OR REPLACE FUNCTION public.import_visma_product_master(_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows_in int;
  v_unique int;
  v_matched int;
  v_not_matched int;
  v_pg2_before int;
  v_pg2_after int;
  v_kategori jsonb;
  v_status jsonb;
  v_report jsonb;
BEGIN
  CREATE TEMP TABLE _stg ON COMMIT DROP AS
  SELECT
    (x->>'varenr')::text       AS varenr,
    NULLIF(x->>'beskrivelse','') AS beskrivelse,
    NULLIF(x->>'pg1','')        AS pg1,
    NULLIF(x->>'pg2','')        AS pg2,
    NULLIF(x->>'pg3','')        AS pg3,
    COALESCE((x->>'spaerret')::boolean, false) AS spaerret
  FROM jsonb_array_elements(_data) x;

  SELECT count(*), count(DISTINCT varenr) INTO v_rows_in, v_unique FROM _stg;

  SELECT count(*) INTO v_matched
    FROM _stg s JOIN public.products p USING (varenr);
  SELECT count(*) INTO v_not_matched
    FROM _stg s LEFT JOIN public.products p USING (varenr) WHERE p.varenr IS NULL;

  SELECT count(*) INTO v_pg2_before
    FROM _stg s JOIN public.products p USING (varenr)
   WHERE p.produktprisgruppe_2 IS NULL AND s.pg2 IS NOT NULL;

  UPDATE public.products p SET
    beskrivelse         = COALESCE(s.beskrivelse, p.beskrivelse),
    produktprisgruppe_1 = COALESCE(s.pg1, p.produktprisgruppe_1),
    produktprisgruppe_2 = COALESCE(s.pg2, p.produktprisgruppe_2),
    produktprisgruppe_3 = COALESCE(s.pg3, p.produktprisgruppe_3),
    kategori = CASE
      WHEN p.kategori_manuel THEN p.kategori
      WHEN s.pg2 IS NOT NULL THEN public._map_kategori_from_pg2(s.pg2)
      ELSE p.kategori
    END,
    record_status = CASE WHEN s.spaerret THEN 'udgaaet' ELSE p.record_status END,
    updated_at = now()
  FROM _stg s WHERE p.varenr = s.varenr;

  SELECT count(*) INTO v_pg2_after FROM public.products WHERE produktprisgruppe_2 IS NOT NULL;

  SELECT jsonb_object_agg(kategori, c) INTO v_kategori
    FROM (SELECT kategori, count(*) c FROM public.products GROUP BY kategori) t;
  SELECT jsonb_object_agg(record_status, c) INTO v_status
    FROM (SELECT record_status, count(*) c FROM public.products GROUP BY record_status) t;

  v_report := jsonb_build_object(
    'rows_in_file', v_rows_in,
    'unique_varenr', v_unique,
    'matched', v_matched,
    'not_matched', v_not_matched,
    'pg2_was_null_before', v_pg2_before,
    'pg2_filled_after', v_pg2_after,
    'kategori_breakdown', v_kategori,
    'record_status_breakdown', v_status
  );

  INSERT INTO public._product_master_import_log(report) VALUES (v_report);
  RETURN v_report;
END $$;

REVOKE ALL ON FUNCTION public.import_visma_product_master(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_visma_product_master(jsonb) TO service_role;
