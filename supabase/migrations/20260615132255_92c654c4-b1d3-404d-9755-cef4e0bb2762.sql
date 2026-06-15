
-- 1. Fix activities: remove the broad SELECT policy
DROP POLICY IF EXISTS "Alle indloggede brugere kan se aktiviteter" ON public.activities;

-- 2. Fix company_documents: replace broad SELECT policy with scoped one
DROP POLICY IF EXISTS "Alle kan læse dokumenter" ON public.company_documents;
CREATE POLICY "Læs dokumenter for tilgængelige virksomheder"
  ON public.company_documents
  FOR SELECT
  TO authenticated
  USING (public.can_access_company(auth.uid(), company_id));

-- 3. Fix storage policy for company-documents bucket: require ownership
DROP POLICY IF EXISTS "Auth læser company-documents" ON storage.objects;
CREATE POLICY "Læs company-documents for tilgængelige virksomheder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.company_documents cd
      WHERE cd.storage_path = storage.objects.name
        AND public.can_access_company(auth.uid(), cd.company_id)
    )
  );

-- 4. Revoke column-level SELECT on contribution from authenticated (defensive — mirrors sales_monthly)
REVOKE SELECT (contribution) ON public.sales_top_products FROM authenticated;
REVOKE SELECT (contribution) ON public.sales_top_products FROM anon;
