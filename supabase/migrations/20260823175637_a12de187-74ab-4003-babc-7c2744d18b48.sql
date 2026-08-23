CREATE OR REPLACE FUNCTION public.penhed_sync_candidates()
RETURNS TABLE(cvr text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.cvr
  FROM public.companies c
  WHERE c.cvr IS NOT NULL
    AND c.customer_type IN ('aktiv_kunde','sovende_kunde')
    AND coalesce(c.binding_status,'') <> 'intern_privat'
    AND NOT public.is_offentlig_kunde(c.name, c.main_branch_code, c.is_public, c.institution_type)
    AND NOT EXISTS (SELECT 1 FROM public.cvr_blocklist b WHERE b.cvr = c.cvr)
$$;

REVOKE ALL ON FUNCTION public.penhed_sync_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.penhed_sync_candidates() TO service_role;

SELECT cron.schedule(
  'process-penhed-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://project--b71c8e7d-6902-4ef2-ab3f-38be7c88bb6d.lovable.app/api/public/hooks/process-penhed-sync',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVteXRmZW9ud3VxbWdxcndnaWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDU4MjgsImV4cCI6MjA5NDUyMTgyOH0.9bcKyCUx_wwBlOd1MMPez0i4Cg_OarlKhTROBjoStDA"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);