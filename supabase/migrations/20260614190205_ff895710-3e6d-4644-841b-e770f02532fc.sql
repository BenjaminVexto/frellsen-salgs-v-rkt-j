
-- 1) Udvid invoice_import_jobs til at understøtte server-worker
ALTER TABLE public.invoice_import_jobs
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS aggregated_path text,
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- 2) RLS politikker for invoice-uploads bucket på storage.objects
-- (bucket'en oprettes via tool umiddelbart efter denne migration)
DROP POLICY IF EXISTS "Admin kan uploade fakturafiler" ON storage.objects;
CREATE POLICY "Admin kan uploade fakturafiler"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-uploads'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admin kan se fakturafiler" ON storage.objects;
CREATE POLICY "Admin kan se fakturafiler"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-uploads'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admin kan slette fakturafiler" ON storage.objects;
CREATE POLICY "Admin kan slette fakturafiler"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-uploads'
    AND public.is_admin(auth.uid())
  );
