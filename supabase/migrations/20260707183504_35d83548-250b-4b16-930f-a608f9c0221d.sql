CREATE OR REPLACE FUNCTION public.can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _company_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'salgssupport')
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = _company_id
          AND c.assigned_to = _user_id
      )
    )
$$;