CREATE OR REPLACE FUNCTION public.konto_oms_12m(_ids uuid[])
RETURNS TABLE(company_id uuid, oms_12m numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  SELECT i.id, COALESCE((SELECT sum(m.rev) FROM sales_kunde_maaned m
                         WHERE m.company_id = i.id AND m.period >= _fra AND m.period < _til), 0)::numeric
  FROM unnest(_ids) AS i(id)
  WHERE public._maa_se_kontosalg(i.id);
END $$;
REVOKE ALL ON FUNCTION public.konto_oms_12m(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konto_oms_12m(uuid[]) TO authenticated;