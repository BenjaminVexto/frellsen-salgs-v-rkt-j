CREATE OR REPLACE FUNCTION public.konto_oms_12m(_ids uuid[])
RETURNS TABLE(company_id uuid, oms_12m numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
        _admin boolean := public.is_admin(auth.uid());
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT m.company_id AS id, sum(m.rev) AS rev FROM sales_kunde_maaned m
    WHERE m.company_id = ANY(_ids) AND m.period >= _fra AND m.period < _til
    GROUP BY m.company_id
  )
  SELECT s.id, COALESCE(s.rev, 0)::numeric FROM s
  WHERE _admin OR public._maa_se_kontosalg(s.id);
END $$;