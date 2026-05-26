-- company_documents table
CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL,
  document_type text NOT NULL DEFAULT 'andet'
    CHECK (document_type IN ('aftale','kontrakt','tilbud','maskine','andet')),
  expires_at date NULL,
  notes text NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  file_size_bytes bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_company ON public.company_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_company_documents_expires ON public.company_documents(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle kan læse dokumenter"
  ON public.company_documents FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/salgssupport opretter dokumenter"
  ON public.company_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

CREATE POLICY "Admin/salgssupport opdaterer dokumenter"
  ON public.company_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

CREATE POLICY "Admin/salgssupport sletter dokumenter"
  ON public.company_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth læser company-documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company-documents');

CREATE POLICY "Admin/salgssupport uploader company-documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

CREATE POLICY "Admin/salgssupport opdaterer company-documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

CREATE POLICY "Admin/salgssupport sletter company-documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );