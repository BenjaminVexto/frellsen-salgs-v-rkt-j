-- Import batches: spor hver CSV-import
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  company_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin styrer import_batches"
ON public.import_batches
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Stempel virksomheder med deres import-batch
ALTER TABLE public.companies
  ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN import_batch_date timestamptz;

CREATE INDEX idx_companies_import_batch_id ON public.companies(import_batch_id);

-- Tillad admin at slette aktiviteter og tilbud (companies, contacts, contact_list_assignments,
-- sales_opportunities har allerede admin DELETE via deres eksisterende ALL/DELETE-policies)
CREATE POLICY "Admin sletter aktiviteter"
ON public.activities
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admin sletter tilbud"
ON public.quotes
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));
