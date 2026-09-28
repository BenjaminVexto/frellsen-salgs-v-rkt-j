ALTER TABLE public.import_log ADD COLUMN afviste integer NOT NULL DEFAULT 0, ADD COLUMN afviste_detaljer jsonb;
DROP FUNCTION IF EXISTS public.log_import(text,text,text,text);
CREATE OR REPLACE FUNCTION public.log_import(_type text, _status text, _filename text, _fejl text, _afviste integer DEFAULT 0, _afviste_detaljer jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO public.import_log (import_type, status, filename, fejl, created_by, afviste, afviste_detaljer)
  VALUES (_type, _status, _filename, left(_fejl, 500), auth.uid(), coalesce(_afviste,0), _afviste_detaljer);
END $$;
GRANT EXECUTE ON FUNCTION public.log_import(text,text,text,text,integer,jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.import_status();
CREATE FUNCTION public.import_status()
RETURNS TABLE (import_type text, ok_at timestamptz, ok_navn text, ok_fil text, ok_afviste integer, fejl_at timestamptz, fejl_tekst text, seneste_data timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.t, ok.created_at, p.full_name, ok.filename, ok.afviste, f.created_at, f.fejl,
    CASE t.t
      WHEN 'maskiner' THEN greatest((SELECT max(created_at) FROM machines), (SELECT max(created_at) FROM machine_enrichment))
      WHEN 'prismatrix' THEN (SELECT max(created_at) FROM agreement_pricing)
      WHEN 'aktoer' THEN (SELECT max(created_at) FROM import_batches WHERE coalesce(kind,'companies')='companies')
      ELSE NULL END
  FROM unnest(ARRAY['aktoer','faktura','maskiner','prismatrix']) t(t)
  LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='ok' ORDER BY created_at DESC LIMIT 1) ok ON true
  LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='fejl' ORDER BY created_at DESC LIMIT 1) f ON true
  LEFT JOIN profiles p ON p.id = ok.created_by
  WHERE public.has_role(auth.uid(), 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.import_status() TO authenticated;