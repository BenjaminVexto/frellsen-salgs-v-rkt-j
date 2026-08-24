CREATE OR REPLACE FUNCTION public.latest_forbrug_snapshot_periode()
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT max(h.snapshot_periode)
  FROM public.forbrug_signal_historik h
$$;

REVOKE ALL ON FUNCTION public.latest_forbrug_snapshot_periode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_forbrug_snapshot_periode() TO authenticated, service_role;