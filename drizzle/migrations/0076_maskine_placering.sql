CREATE TABLE public.maskine_placering (
  serienr text PRIMARY KEY,
  placering text,
  kilde text NOT NULL DEFAULT 'crm' CHECK (kilde IN ('crm','visma')),
  opdateret_af uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.maskine_placering IS 'Placering i bygningen pr. maskine (serienr.). Ligger uden for location_equipment_units, fordi importen sletter og genindsætter udstyr.';
GRANT SELECT ON public.maskine_placering TO authenticated;
GRANT ALL ON public.maskine_placering TO service_role;
ALTER TABLE public.maskine_placering ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle ser placering" ON public.maskine_placering FOR SELECT TO authenticated USING (true);

CREATE TABLE public.maskine_placering_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serienr text NOT NULL,
  gammel text,
  ny text,
  kilde text NOT NULL,
  udfoert_af uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  udfoert_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.maskine_placering_log (serienr, udfoert_at DESC);
GRANT SELECT ON public.maskine_placering_log TO authenticated;
GRANT ALL ON public.maskine_placering_log TO service_role;
ALTER TABLE public.maskine_placering_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle ser placeringslog" ON public.maskine_placering_log FOR SELECT TO authenticated USING (true);

-- Brugerens redigering på kundekortet
CREATE OR REPLACE FUNCTION public.saet_maskine_placering(_serienr text, _placering text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _gl text; _ny text := nullif(btrim(coalesce(_placering,'')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Ikke logget ind'; END IF;
  IF nullif(btrim(coalesce(_serienr,'')),'') IS NULL THEN RAISE EXCEPTION 'Serienr. mangler'; END IF;
  SELECT placering INTO _gl FROM maskine_placering WHERE serienr = btrim(_serienr);
  IF _gl IS NOT DISTINCT FROM _ny THEN RETURN; END IF;
  INSERT INTO maskine_placering (serienr, placering, kilde, opdateret_af, opdateret_at)
  VALUES (btrim(_serienr), _ny, 'crm', auth.uid(), now())
  ON CONFLICT (serienr) DO UPDATE SET placering = EXCLUDED.placering, kilde = 'crm', opdateret_af = auth.uid(), opdateret_at = now();
  INSERT INTO maskine_placering_log (serienr, gammel, ny, kilde, udfoert_af) VALUES (btrim(_serienr), _gl, _ny, 'crm', auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.saet_maskine_placering(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.saet_maskine_placering(text, text) TO authenticated;

-- Til senere Visma-import: tom værdi ignoreres, og en CRM-indtastning overskrives aldrig.
CREATE OR REPLACE FUNCTION public.import_maskine_placering(_serienr text, _placering text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ny text := nullif(btrim(coalesce(_placering,'')), ''); _r maskine_placering;
BEGIN
  IF _ny IS NULL OR nullif(btrim(coalesce(_serienr,'')),'') IS NULL THEN RETURN; END IF;
  SELECT * INTO _r FROM maskine_placering WHERE serienr = btrim(_serienr);
  IF FOUND AND (_r.kilde = 'crm' AND _r.placering IS NOT NULL OR _r.placering IS NOT DISTINCT FROM _ny) THEN RETURN; END IF;
  INSERT INTO maskine_placering (serienr, placering, kilde, opdateret_af, opdateret_at)
  VALUES (btrim(_serienr), _ny, 'visma', NULL, now())
  ON CONFLICT (serienr) DO UPDATE SET placering = EXCLUDED.placering, kilde = 'visma', opdateret_af = NULL, opdateret_at = now();
  INSERT INTO maskine_placering_log (serienr, gammel, ny, kilde) VALUES (btrim(_serienr), _r.placering, _ny, 'visma');
END $$;
REVOKE ALL ON FUNCTION public.import_maskine_placering(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_maskine_placering(text, text) TO service_role;