CREATE OR REPLACE FUNCTION public.aktive_saelgere()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name FROM profiles p
  WHERE auth.uid() IS NOT NULL AND p.is_active
    AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = p.id AND r.role = 'saelger')
  ORDER BY p.full_name
$$;
GRANT EXECUTE ON FUNCTION public.aktive_saelgere() TO authenticated;