-- Løbende, prioriteret P-enhedssynk i stedet for ugentligt batch.

-- 1) Statustabel pr. CVR (også CVR'er med 0 P-enheder registreres her)
CREATE TABLE public.cvr_penhed_sync_status (
  cvr text PRIMARY KEY,
  last_synced_at timestamptz,
  last_status text,
  last_error text,
  antal_penheder integer,
  prioritet_override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cvr_penhed_sync_status TO authenticated;
GRANT ALL ON public.cvr_penhed_sync_status TO service_role;

ALTER TABLE public.cvr_penhed_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY penhed_sync_status_admin ON public.cvr_penhed_sync_status
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY tm_spaerret ON public.cvr_penhed_sync_status
  AS RESTRICTIVE FOR ALL TO public
  USING (NOT (SELECT public.er_telemarketing()))
  WITH CHECK (NOT (SELECT public.er_telemarketing()));

-- 2) Backfill: CVR'er der allerede har P-enheder, synkes ikke forfra
INSERT INTO public.cvr_penhed_sync_status (cvr, last_synced_at, last_status, antal_penheder)
SELECT cvr, max(synced_at), 'ok', count(*) FILTER (WHERE is_active)
FROM public.cvr_penheder
GROUP BY cvr
ON CONFLICT (cvr) DO NOTHING;

-- 3) Ny kandidatregel: alle erhvervskundetyper, segment 10-udelukkelse fjernet.
--    Et CVR er med, hvis bare én konto opfylder reglen.
CREATE OR REPLACE FUNCTION public.penhed_sync_candidates()
RETURNS TABLE(cvr text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT c.cvr
  FROM public.companies c
  WHERE c.cvr ~ '^\d{8}$'
    AND c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde')
    AND public.kundetype(c.customer_segment_3) NOT IN ('intern','offentlig')
    AND NOT EXISTS (SELECT 1 FROM public.cvr_blocklist b WHERE b.cvr = c.cvr)
$function$;

-- Indeks til kandidatopslag
CREATE INDEX IF NOT EXISTS companies_cvr_idx ON public.companies (cvr) WHERE cvr IS NOT NULL;

-- 4) Spring over køen: kaldes når et kundekort åbnes (idempotent, blokerer ikke visning)
CREATE OR REPLACE FUNCTION public.penhed_sync_prioriter(_cvr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _cvr IS NULL OR _cvr !~ '^\d{8}$' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.penhed_sync_candidates() k WHERE k.cvr = _cvr) THEN RETURN; END IF;
  INSERT INTO public.cvr_penhed_sync_status (cvr, prioritet_override_at)
  VALUES (_cvr, now())
  ON CONFLICT (cvr) DO UPDATE
    SET prioritet_override_at = now()
    WHERE cvr_penhed_sync_status.prioritet_override_at IS NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.penhed_sync_prioriter(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.penhed_sync_prioriter(text) TO authenticated, service_role;

-- 5) Worker registrerer resultat pr. CVR (succes eller fejl)
CREATE OR REPLACE FUNCTION public.penhed_sync_registrer(_cvr text, _status text, _antal integer, _fejl text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.cvr_penhed_sync_status (cvr, last_synced_at, last_status, last_error, antal_penheder, prioritet_override_at)
  VALUES (_cvr, now(), _status, _fejl, _antal, NULL)
  ON CONFLICT (cvr) DO UPDATE SET
    last_synced_at = now(),
    last_status = _status,
    last_error = _fejl,
    antal_penheder = _antal,
    prioritet_override_at = NULL;
$function$;

REVOKE ALL ON FUNCTION public.penhed_sync_registrer(text, text, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.penhed_sync_registrer(text, text, integer, text) TO service_role;

-- 6) Læg ét nyt job (25 CVR'er) i køen, kun når intet venter/kører.
--    Prioritet: 1) override, 2) aldrig synket (aktiv før sovende før service før tidligere),
--    3) forfaldne genopfriskninger (aktive 30 dage, andre 90 dage). Fejlede venter 24 timer.
CREATE OR REPLACE FUNCTION public.queue_penhed_sync_naeste()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cvrs text[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.cvr_penhed_sync_jobs WHERE status IN ('pending','processing')) THEN
    RETURN 0;
  END IF;

  WITH k AS (
    SELECT c.cvr,
           min(CASE c.customer_type
                 WHEN 'aktiv_kunde' THEN 1
                 WHEN 'sovende_kunde' THEN 2
                 WHEN 'servicekunde' THEN 3
                 WHEN 'tidligere_kunde' THEN 4
               END) AS rang
    FROM public.companies c
    WHERE c.cvr ~ '^\d{8}$'
      AND c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde')
      AND public.kundetype(c.customer_segment_3) NOT IN ('intern','offentlig')
      AND NOT EXISTS (SELECT 1 FROM public.cvr_blocklist b WHERE b.cvr = c.cvr)
    GROUP BY c.cvr
  ),
  valgt AS (
    SELECT k.cvr
    FROM k
    LEFT JOIN public.cvr_penhed_sync_status s ON s.cvr = k.cvr
    WHERE NOT (s.last_status = 'fejl' AND coalesce(s.last_synced_at, '-infinity'::timestamptz) > now() - interval '24 hours')
      AND (
        s.prioritet_override_at IS NOT NULL
        OR s.cvr IS NULL
        OR (k.rang = 1 AND s.last_synced_at < now() - interval '30 days')
        OR (k.rang > 1 AND s.last_synced_at < now() - interval '90 days')
      )
    ORDER BY
      CASE WHEN s.prioritet_override_at IS NOT NULL THEN 0
           WHEN s.cvr IS NULL THEN 1
           ELSE 2 END,
      s.prioritet_override_at NULLS LAST,
      k.rang,
      s.last_synced_at NULLS FIRST
    LIMIT 25
  )
  SELECT array_agg(cvr) INTO v_cvrs FROM valgt;

  IF v_cvrs IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.cvr_penhed_sync_jobs (cvrs) VALUES (v_cvrs);
  UPDATE public.cvr_penhed_sync_status SET prioritet_override_at = NULL WHERE cvr = ANY(v_cvrs);
  RETURN 1;
END
$function$;

REVOKE ALL ON FUNCTION public.queue_penhed_sync_naeste() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_penhed_sync_naeste() TO service_role;

-- 7) Admin-overblik over køen
CREATE OR REPLACE FUNCTION public.penhed_sync_overblik()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats json;
  v_fejl json;
  v_seneste timestamptz;
BEGIN
  WITH k AS (
    SELECT c.cvr,
           min(CASE c.customer_type
                 WHEN 'aktiv_kunde' THEN 1
                 WHEN 'sovende_kunde' THEN 2
                 WHEN 'servicekunde' THEN 3
                 WHEN 'tidligere_kunde' THEN 4
               END) AS rang
    FROM public.companies c
    WHERE c.cvr ~ '^\d{8}$'
      AND c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde')
      AND public.kundetype(c.customer_segment_3) NOT IN ('intern','offentlig')
      AND NOT EXISTS (SELECT 1 FROM public.cvr_blocklist b WHERE b.cvr = c.cvr)
    GROUP BY c.cvr
  )
  SELECT json_build_object(
    'i_reglen', count(*),
    'synket', count(*) FILTER (WHERE s.last_synced_at IS NOT NULL),
    'aldrig', count(*) FILTER (WHERE s.cvr IS NULL),
    'forfaldne', count(*) FILTER (WHERE s.cvr IS NOT NULL AND ((k.rang = 1 AND s.last_synced_at < now() - interval '30 days') OR (k.rang > 1 AND s.last_synced_at < now() - interval '90 days'))),
    'fejl_7d', count(*) FILTER (WHERE s.last_status = 'fejl' AND s.last_synced_at > now() - interval '7 days')
  ) INTO v_stats
  FROM k LEFT JOIN public.cvr_penhed_sync_status s ON s.cvr = k.cvr;

  SELECT coalesce(json_agg(x), '[]'::json) INTO v_fejl FROM (
    SELECT cvr, last_error AS fejl, last_synced_at
    FROM public.cvr_penhed_sync_status
    WHERE last_status = 'fejl' AND last_synced_at > now() - interval '7 days'
    ORDER BY last_synced_at DESC
    LIMIT 20
  ) x;

  SELECT max(finished_at) INTO v_seneste FROM public.cvr_penhed_sync_jobs WHERE status = 'done';

  RETURN v_stats || json_build_object('fejl_liste', v_fejl, 'seneste_job', v_seneste);
END
$function$;

REVOKE ALL ON FUNCTION public.penhed_sync_overblik() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.penhed_sync_overblik() TO service_role;

-- 8) Den ugentlige batch-funktion udgår (cron-jobbet fjernes separat)
DROP FUNCTION public.queue_penhed_sync_ugentlig();