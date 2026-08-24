CREATE OR REPLACE VIEW public.forbrug_signal_seneste
WITH (security_invoker = on) AS
SELECT h.*
FROM public.forbrug_signal_historik h
WHERE h.snapshot_periode = (
  SELECT max(h2.snapshot_periode)
  FROM public.forbrug_signal_historik h2
);

REVOKE ALL ON public.forbrug_signal_seneste FROM anon;
GRANT SELECT ON public.forbrug_signal_seneste TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.latest_forbrug_snapshot_periode();