CREATE OR REPLACE FUNCTION public.prevent_non_admin_assigned_to_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    -- Tillad service-role / server-side admin-kald (auth.uid() er NULL).
    -- Almindelige brugere skal være admin for at ændre tildeling.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Kun administratorer kan ændre tildeling af virksomheder';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;