REVOKE ALL ON FUNCTION public.my_afdelinger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_afdelinger() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_afdelinger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_afdelinger() TO service_role;