CREATE OR REPLACE FUNCTION public.set_primary_location(p_company_id uuid, p_visma_delivery_no text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.locations SET is_primary = false
  WHERE company_id = p_company_id
    AND is_primary = true
    AND visma_delivery_no IS DISTINCT FROM p_visma_delivery_no;

  UPDATE public.locations SET is_primary = true
  WHERE company_id = p_company_id AND visma_delivery_no = p_visma_delivery_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_primary_location(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_location(uuid, text) TO service_role;