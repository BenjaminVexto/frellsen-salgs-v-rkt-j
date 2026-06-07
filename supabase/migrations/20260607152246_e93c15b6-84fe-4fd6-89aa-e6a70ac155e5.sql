
DO $$
DECLARE
  j record;
  new_cmd text;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command ILIKE '%process-cvr-enrichment%'
  LOOP
    -- Replace the apikey header value (anon key) with the service role key,
    -- and rename the header to x-cron-secret for clarity. We do a best-effort
    -- regex swap that covers the typical net.http_post(headers := jsonb_build_object(...)) shape.
    new_cmd := regexp_replace(
      j.command,
      '''apikey''\s*,\s*''[^'']+''',
      '''x-cron-secret'', current_setting(''app.settings.service_role_key'', true)',
      'gi'
    );
    -- Also handle case where the header was built with the literal env name
    new_cmd := regexp_replace(
      new_cmd,
      '''apikey''',
      '''x-cron-secret''',
      'gi'
    );
    PERFORM cron.alter_job(job_id := j.jobid, command := new_cmd);
  END LOOP;
END $$;
