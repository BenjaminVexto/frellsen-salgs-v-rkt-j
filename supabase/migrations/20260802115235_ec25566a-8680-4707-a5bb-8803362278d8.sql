DROP POLICY IF EXISTS "Users can view accessible sales_monthly_products" ON public.sales_monthly_products;

CREATE POLICY "Users can view accessible sales_monthly_products"
ON public.sales_monthly_products
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN location_id IS NULL THEN (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport')
    )
    ELSE EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.id = sales_monthly_products.location_id
        AND l.company_id IS NOT NULL
        AND public.can_access_company(auth.uid(), l.company_id)
    )
  END
);

REVOKE SELECT ON public.sales_monthly_products FROM authenticated;
GRANT SELECT (id, location_id, visma_delivery_no, period, varenr, description, product_group_1, revenue, quantity, updated_at)
  ON public.sales_monthly_products TO authenticated;
REVOKE ALL ON public.sales_monthly_products FROM anon;
GRANT ALL ON public.sales_monthly_products TO service_role;