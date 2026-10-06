CREATE OR REPLACE FUNCTION public.import_maskine_placering(_serienr text, _placering text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _ny text := nullif(btrim(coalesce(_placering,'')), ''); _r maskine_placering;
BEGIN
  -- Tom værdi fra importen overskriver aldrig. Ny ikke-tom Visma-værdi vinder og logges.
  IF _ny IS NULL OR nullif(btrim(coalesce(_serienr,'')),'') IS NULL THEN RETURN; END IF;
  SELECT * INTO _r FROM maskine_placering WHERE serienr = btrim(_serienr);
  IF FOUND AND _r.placering IS NOT DISTINCT FROM _ny THEN RETURN; END IF;
  INSERT INTO maskine_placering (serienr, placering, kilde, opdateret_af, opdateret_at)
  VALUES (btrim(_serienr), _ny, 'visma', NULL, now())
  ON CONFLICT (serienr) DO UPDATE SET placering = EXCLUDED.placering, kilde = 'visma', opdateret_af = NULL, opdateret_at = now();
  INSERT INTO maskine_placering_log (serienr, gammel, ny, kilde) VALUES (btrim(_serienr), _r.placering, _ny, 'visma');
END $function$;

CREATE OR REPLACE FUNCTION public.import_maskine_placeringer(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _x jsonb; _n int := 0; _foer text;
BEGIN
  FOR _x IN SELECT * FROM jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) LOOP
    SELECT placering INTO _foer FROM maskine_placering WHERE serienr = btrim(_x->>'serienr');
    PERFORM public.import_maskine_placering(_x->>'serienr', _x->>'placering');
    IF nullif(btrim(coalesce(_x->>'placering','')),'') IS NOT NULL AND _foer IS DISTINCT FROM btrim(_x->>'placering') THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END $function$;
REVOKE ALL ON FUNCTION public.import_maskine_placeringer(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_maskine_placeringer(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.lokationer_med_leje(_location_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT l.id FROM locations l
  WHERE l.id = ANY(_location_ids) AND l.visma_delivery_no IS NOT NULL
    AND EXISTS (SELECT 1 FROM invoice_lines il
      WHERE il.visma_delivery_no = l.visma_delivery_no AND il.afdeling_nr = l.afdeling_nr
        AND il.varegruppe_1 = '16' AND il.varegruppe_2 = '80'
        AND il.faktura_dato >= (current_date - interval '12 months'));
$function$;
REVOKE ALL ON FUNCTION public.lokationer_med_leje(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lokationer_med_leje(uuid[]) TO authenticated, service_role;