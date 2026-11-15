CREATE OR REPLACE FUNCTION public.maalepunkt_kpg45_konti(_ids uuid[])
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY SELECT c.id FROM public.companies c WHERE c.id = ANY(_ids) AND c.customer_segment_3 LIKE '45 [%';
END $$;
REVOKE ALL ON FUNCTION public.maalepunkt_kpg45_konti(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maalepunkt_kpg45_konti(uuid[]) TO authenticated, service_role;