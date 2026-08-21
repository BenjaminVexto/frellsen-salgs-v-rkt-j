DROP FUNCTION IF EXISTS public.set_primary_location(uuid, text);

CREATE OR REPLACE FUNCTION public.set_primary_location(p_company_id uuid, p_visma_delivery_no text, p_afdeling_nr integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.locations SET is_primary = false
  WHERE company_id = p_company_id
    AND afdeling_nr = p_afdeling_nr
    AND is_primary = true
    AND visma_delivery_no IS DISTINCT FROM p_visma_delivery_no;

  UPDATE public.locations SET is_primary = true
  WHERE company_id = p_company_id
    AND afdeling_nr = p_afdeling_nr
    AND visma_delivery_no = p_visma_delivery_no;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_primary_location(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_location(uuid, text, integer) TO service_role;