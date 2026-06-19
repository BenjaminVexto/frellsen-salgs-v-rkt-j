
-- 1) Restrict agreement-documents read access to admin/salgssupport
DROP POLICY IF EXISTS agreement_docs_read ON storage.objects;
CREATE POLICY agreement_docs_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'agreement-documents'
    AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'salgssupport'))
  );

-- 2) Revoke column-level SELECT on contribution from authenticated on sales_top_products
REVOKE SELECT (contribution) ON public.sales_top_products FROM authenticated;
