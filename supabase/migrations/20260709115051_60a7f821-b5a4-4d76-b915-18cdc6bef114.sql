-- 1. Tighten machine_enrichment SELECT
DROP POLICY IF EXISTS "Authenticated can read machine_enrichment" ON public.machine_enrichment;

CREATE POLICY "Users can read accessible machine_enrichment"
  ON public.machine_enrichment FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'salgssupport'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.location_equipment_units u
      JOIN public.locations l ON l.id = u.location_id
      WHERE u.serial_no = machine_enrichment.serienr
        AND l.company_id IS NOT NULL
        AND public.can_access_company(auth.uid(), l.company_id)
    )
  );

-- 2. Revoke column-level SELECT on contribution from authenticated for sales_monthly_products
REVOKE SELECT (contribution) ON public.sales_monthly_products FROM authenticated;