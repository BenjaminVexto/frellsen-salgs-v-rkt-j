-- Retter 'operator does not exist: json || json' i penhed_sync_overblik:
-- json_build_object returnerer json, men || findes kun for jsonb.
CREATE OR REPLACE FUNCTION public.penhed_sync_overblik()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb;
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
  SELECT jsonb_build_object(
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

  RETURN (v_stats || jsonb_build_object('fejl_liste', v_fejl, 'seneste_job', v_seneste))::json;
END
$function$;

REVOKE ALL ON FUNCTION public.penhed_sync_overblik() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.penhed_sync_overblik() TO service_role;