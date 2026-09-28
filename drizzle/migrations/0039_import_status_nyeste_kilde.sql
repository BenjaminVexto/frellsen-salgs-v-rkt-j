CREATE OR REPLACE FUNCTION public.import_status()
 RETURNS TABLE(import_type text, ok_at timestamp with time zone, ok_navn text, ok_fil text, ok_afviste integer, fejl_at timestamp with time zone, fejl_tekst text, seneste_data timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT t.t,
      ok.created_at AS log_at, ok.created_by AS log_by, ok.filename AS log_fil, ok.afviste AS log_afv,
      f.created_at AS f_at, f.fejl AS f_tekst,
      CASE t.t
        WHEN 'maskiner' THEN greatest((SELECT max(created_at) FROM machines), (SELECT max(created_at) FROM machine_enrichment))
        WHEN 'prismatrix' THEN (SELECT max(created_at) FROM agreement_pricing)
        WHEN 'aktoer' THEN ib.created_at
        WHEN 'faktura' THEN (SELECT max(coalesce(finished_at, created_at)) FROM invoice_import_jobs WHERE status IN ('done','completed','ok'))
      END AS data_at,
      ib.created_by AS ib_by, ib.filename AS ib_fil
    FROM unnest(ARRAY['aktoer','faktura','maskiner','prismatrix']) t(t)
    LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='ok' ORDER BY created_at DESC LIMIT 1) ok ON true
    LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='fejl' ORDER BY created_at DESC LIMIT 1) f ON true
    LEFT JOIN LATERAL (SELECT * FROM import_batches b WHERE t.t='aktoer' AND coalesce(b.kind,'companies')='companies' AND b.company_count > 0 ORDER BY created_at DESC LIMIT 1) ib ON true
  )
  SELECT b.t,
    -- Nyeste gennemførte import: import_log, eller datakilden hvis den er nyere (fx import_batches for Aktør)
    CASE WHEN b.log_at IS NOT NULL AND (b.data_at IS NULL OR b.log_at >= b.data_at - interval '1 hour') THEN b.log_at
         WHEN b.t = 'aktoer' THEN b.data_at
         ELSE b.log_at END,
    p.full_name,
    CASE WHEN b.log_at IS NOT NULL AND (b.data_at IS NULL OR b.log_at >= b.data_at - interval '1 hour') THEN b.log_fil
         WHEN b.t = 'aktoer' THEN b.ib_fil ELSE b.log_fil END,
    CASE WHEN b.log_at IS NOT NULL AND (b.data_at IS NULL OR b.log_at >= b.data_at - interval '1 hour') THEN b.log_afv ELSE NULL END,
    b.f_at, b.f_tekst, b.data_at
  FROM base b
  LEFT JOIN profiles p ON p.id = CASE WHEN b.log_at IS NOT NULL AND (b.data_at IS NULL OR b.log_at >= b.data_at - interval '1 hour') THEN b.log_by
                                      WHEN b.t='aktoer' THEN b.ib_by ELSE b.log_by END
  WHERE public.has_role(auth.uid(), 'admin')
$function$;