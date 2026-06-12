
-- 1) Hide `contribution` from regular authenticated users on sales tables.
-- Admin reads contribution through server functions that use the service_role client.
REVOKE SELECT ON public.sales_monthly FROM authenticated;
GRANT SELECT (id, location_id, company_id, visma_delivery_no, period, product_group_1, revenue, quantity, order_count, updated_at) ON public.sales_monthly TO authenticated;

REVOKE SELECT ON public.sales_top_products FROM authenticated;
GRANT SELECT (id, location_id, visma_delivery_no, varenr, description, revenue, quantity, updated_at, product_group_1) ON public.sales_top_products TO authenticated;

-- 2) Tighten always-true UPDATE/DELETE policies on relation tables.
DROP POLICY IF EXISTS "auth update relations" ON public.company_relations;
DROP POLICY IF EXISTS "auth delete relations" ON public.company_relations;
CREATE POLICY "auth update relations" ON public.company_relations
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete relations" ON public.company_relations
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth update suggestions" ON public.company_relation_suggestions;
DROP POLICY IF EXISTS "auth delete suggestions" ON public.company_relation_suggestions;
CREATE POLICY "auth update suggestions" ON public.company_relation_suggestions
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete suggestions" ON public.company_relation_suggestions
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
