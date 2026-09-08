CREATE OR REPLACE FUNCTION public.portfolio_aggregat_json(_saelger uuid DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
  FROM public.portfolio_aggregat(_saelger, _afdeling_nr) p;
$function$;

REVOKE ALL ON FUNCTION public.portfolio_aggregat_json(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_aggregat_json(uuid, integer) TO authenticated, service_role;