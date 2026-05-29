
CREATE TABLE IF NOT EXISTS public.agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kp1_code text,
  kp2_code text,
  valid_from date,
  valid_to date,
  is_public_sector boolean NOT NULL DEFAULT false,
  governing_party_name text,
  governing_party_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  document_path text,
  document_filename text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreements TO authenticated;
GRANT ALL ON public.agreements TO service_role;

CREATE INDEX IF NOT EXISTS idx_agreements_kp1 ON public.agreements(kp1_code);
CREATE INDEX IF NOT EXISTS idx_agreements_kp2 ON public.agreements(kp2_code);

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agreements_read" ON public.agreements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agreements_write" ON public.agreements
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER agreements_touch_updated_at
  BEFORE UPDATE ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('agreement-documents', 'agreement-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "agreement_docs_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'agreement-documents');

CREATE POLICY "agreement_docs_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'agreement-documents' AND public.is_admin(auth.uid()));

CREATE POLICY "agreement_docs_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'agreement-documents' AND public.is_admin(auth.uid()));

CREATE POLICY "agreement_docs_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'agreement-documents' AND public.is_admin(auth.uid()));
